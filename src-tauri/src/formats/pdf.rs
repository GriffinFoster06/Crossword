/// PDF export for CrossForge puzzles.
///
/// Generates a publication-quality PDF with:
/// - Properly sized grid with cell numbers and optional solution
/// - Multi-column clue layout with automatic text wrapping
/// - Multi-page support for puzzles with many clues
/// - Configurable paper size (Letter and A4)
/// - Optional solution page

use printpdf::{
    BuiltinFont, Color, Mm, Op, PaintMode, PdfDocument, PdfPage, PdfSaveOptions, Point,
    Polygon, PolygonRing, Pt, Rgb, TextItem, WindingOrder,
    graphics::LinePoint,
};
use crate::formats::json::{PuzzleFile, ClueData};
use crate::engine::grid::Cell;

/// Paper size options.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum PaperSize {
    Letter, // 8.5" × 11"  = 215.9mm × 279.4mm
    A4,     // 210mm × 297mm
}

impl PaperSize {
    pub fn dimensions_mm(self) -> (f32, f32) {
        match self {
            PaperSize::Letter => (215.9, 279.4),
            PaperSize::A4 => (210.0, 297.0),
        }
    }
}

/// Wrap `text` into lines fitting `max_chars`.
fn wrap_text(text: &str, max_chars: usize) -> Vec<String> {
    if max_chars == 0 {
        return vec![text.to_string()];
    }
    let mut lines = Vec::new();
    let mut current = String::new();
    for word in text.split_whitespace() {
        if current.is_empty() {
            current.push_str(word);
        } else if current.len() + 1 + word.len() <= max_chars {
            current.push(' ');
            current.push_str(word);
        } else {
            lines.push(current.clone());
            current = word.to_string();
        }
    }
    if !current.is_empty() {
        lines.push(current);
    }
    if lines.is_empty() {
        lines.push(String::new());
    }
    lines
}

struct RenderedClue {
    first_line: String,
    extra_lines: Vec<String>,
}

fn render_clues(clues: &[ClueData], max_chars: usize) -> Vec<RenderedClue> {
    clues.iter().map(|c| {
        let label = format!("{}.", c.number);
        let indent_len = label.len() + 1;
        let effective_max = max_chars.saturating_sub(indent_len);
        let lines = wrap_text(&c.text, effective_max.max(10));
        let first_line = format!("{} {}", label, lines.first().cloned().unwrap_or_default());
        let indent = " ".repeat(indent_len);
        let extra_lines = lines[1..]
            .iter()
            .map(|l| format!("{}{}", indent, l))
            .collect();
        RenderedClue { first_line, extra_lines }
    }).collect()
}

/// Emit ops to draw a single line of text at (x, y) in mm.
fn push_text(ops: &mut Vec<Op>, text: &str, size: f32, x: f32, y: f32, font: BuiltinFont) {
    if text.is_empty() { return; }
    ops.push(Op::StartTextSection);
    ops.push(Op::SetFontSizeBuiltinFont { size: Pt(size), font });
    ops.push(Op::SetTextCursor { pos: Point::new(Mm(x), Mm(y)) });
    ops.push(Op::WriteTextBuiltinFont {
        items: vec![TextItem::Text(text.to_string())],
        font,
    });
    ops.push(Op::EndTextSection);
}

/// Helper: build a filled+stroked rectangle polygon.
fn rect_poly(x: f32, y: f32, w: f32, h: f32, mode: PaintMode) -> Polygon {
    let pts = vec![
        LinePoint { p: Point::new(Mm(x),     Mm(y)),     bezier: false },
        LinePoint { p: Point::new(Mm(x + w), Mm(y)),     bezier: false },
        LinePoint { p: Point::new(Mm(x + w), Mm(y - h)), bezier: false },
        LinePoint { p: Point::new(Mm(x),     Mm(y - h)), bezier: false },
    ];
    Polygon {
        rings: vec![PolygonRing { points: pts }],
        mode,
        winding_order: WindingOrder::NonZero,
    }
}


fn rgb(r: f32, g: f32, b: f32) -> Color {
    Color::Rgb(Rgb::new(r, g, b, None))
}

pub fn export_pdf(puzzle: &PuzzleFile, include_solution: bool) -> anyhow::Result<Vec<u8>> {
    export_pdf_sized(puzzle, include_solution, PaperSize::Letter)
}

pub fn export_pdf_sized(
    puzzle: &PuzzleFile,
    include_solution: bool,
    paper: PaperSize,
) -> anyhow::Result<Vec<u8>> {
    let size = puzzle.grid.size;
    let (pw, ph) = paper.dimensions_mm();
    let margin = 18.0_f32;

    let font_bold = BuiltinFont::HelveticaBold;
    let font_reg  = BuiltinFont::Helvetica;

    // ── Grid sizing: occupy top ~52% of page ──────────────────────────────
    let avail_w = pw - margin * 2.0;
    let avail_h = ph - margin * 2.0 - 20.0;
    let max_grid_h = avail_h * 0.52;
    let cell_mm = ((avail_w / size as f32).min(max_grid_h / size as f32)).min(13.0);
    let grid_w = cell_mm * size as f32;
    let grid_x = margin + (avail_w - grid_w) / 2.0;
    let grid_top_y = ph - margin - 22.0;

    // ── Page 1: grid + clues ───────────────────────────────────────────────
    let mut ops1: Vec<Op> = Vec::new();

    // Header
    let title_y = ph - margin - 6.0;
    let title = if puzzle.metadata.title.is_empty() { "Crossword" } else { &puzzle.metadata.title };
    push_text(&mut ops1, title, 14.0, margin, title_y, font_bold);
    if !puzzle.metadata.author.is_empty() {
        push_text(&mut ops1, &format!("By {}", puzzle.metadata.author), 9.0, margin, title_y - 7.0, font_reg);
    }
    if let Some(ref date) = puzzle.metadata.date {
        if !date.is_empty() {
            push_text(&mut ops1, date, 9.0, pw - margin - 28.0, title_y, font_reg);
        }
    }

    draw_grid(
        &mut ops1,
        &puzzle.grid.cells,
        size,
        grid_x,
        grid_top_y,
        cell_mm,
        false,
        font_bold,
        font_reg,
    );

    // ── Clue columns ──────────────────────────────────────────────────────
    let clue_top_y = grid_top_y - cell_mm * size as f32 - 8.0;
    let col_w = avail_w / 2.0 - 3.0;
    let chars_per_col = (col_w / 1.9) as usize;
    let line_h = 3.8_f32;
    let clue_fs = 7.0_f32;
    let head_fs = 8.5_f32;
    let bottom_margin = margin + 4.0;

    let across_rc = render_clues(&puzzle.clues.across, chars_per_col);
    let down_rc   = render_clues(&puzzle.clues.down,   chars_per_col);

    // Left column: Across
    let mut y = clue_top_y;
    push_text(&mut ops1, "ACROSS", head_fs, margin, y, font_bold);
    y -= line_h * 1.5;

    let mut across_overflow_start = across_rc.len();
    for (i, rc) in across_rc.iter().enumerate() {
        if y < bottom_margin {
            across_overflow_start = i;
            break;
        }
        push_text(&mut ops1, &rc.first_line, clue_fs, margin, y, font_reg);
        y -= line_h;
        for extra in &rc.extra_lines {
            if y >= bottom_margin {
                push_text(&mut ops1, extra, clue_fs, margin, y, font_reg);
                y -= line_h;
            }
        }
    }

    // Right column: Down
    let right_x = margin + col_w + 6.0;
    y = clue_top_y;
    push_text(&mut ops1, "DOWN", head_fs, right_x, y, font_bold);
    y -= line_h * 1.5;

    let mut down_overflow_start = down_rc.len();
    for (i, rc) in down_rc.iter().enumerate() {
        if y < bottom_margin {
            down_overflow_start = i;
            break;
        }
        push_text(&mut ops1, &rc.first_line, clue_fs, right_x, y, font_reg);
        y -= line_h;
        for extra in &rc.extra_lines {
            if y >= bottom_margin {
                push_text(&mut ops1, extra, clue_fs, right_x, y, font_reg);
                y -= line_h;
            }
        }
    }

    let mut pages = vec![PdfPage::new(Mm(pw), Mm(ph), ops1)];

    // ── Overflow page ──────────────────────────────────────────────────────
    let has_across_overflow = across_overflow_start < across_rc.len();
    let has_down_overflow = down_overflow_start < down_rc.len();
    if has_across_overflow || has_down_overflow {
        let mut ops_ov: Vec<Op> = Vec::new();
        y = ph - margin - 8.0;
        push_text(&mut ops_ov, "Clues (continued)", 12.0, margin, y, font_bold);
        y -= line_h * 2.0;

        if has_across_overflow {
            push_text(&mut ops_ov, "ACROSS", head_fs, margin, y, font_bold);
            y -= line_h * 1.5;
            for rc in &across_rc[across_overflow_start..] {
                if y < bottom_margin { break; }
                push_text(&mut ops_ov, &rc.first_line, clue_fs, margin, y, font_reg);
                y -= line_h;
                for extra in &rc.extra_lines {
                    if y >= bottom_margin {
                        push_text(&mut ops_ov, extra, clue_fs, margin, y, font_reg);
                        y -= line_h;
                    }
                }
            }
        }
        if has_down_overflow {
            y -= line_h;
            push_text(&mut ops_ov, "DOWN", head_fs, margin, y, font_bold);
            y -= line_h * 1.5;
            for rc in &down_rc[down_overflow_start..] {
                if y < bottom_margin { break; }
                push_text(&mut ops_ov, &rc.first_line, clue_fs, margin, y, font_reg);
                y -= line_h;
                for extra in &rc.extra_lines {
                    if y >= bottom_margin {
                        push_text(&mut ops_ov, extra, clue_fs, margin, y, font_reg);
                        y -= line_h;
                    }
                }
            }
        }
        pages.push(PdfPage::new(Mm(pw), Mm(ph), ops_ov));
    }

    // ── Solution page ──────────────────────────────────────────────────────
    if include_solution {
        let mut ops_sol: Vec<Op> = Vec::new();
        let sol_title = format!("Solution — {}", title);
        push_text(&mut ops_sol, &sol_title, 13.0, margin, ph - margin - 6.0, font_bold);

        let sol_cell_mm = ((avail_w / size as f32).min(avail_h / size as f32)).min(14.0);
        let sol_grid_w = sol_cell_mm * size as f32;
        let sol_grid_x = margin + (avail_w - sol_grid_w) / 2.0;
        draw_grid(
            &mut ops_sol,
            &puzzle.grid.cells,
            size,
            sol_grid_x,
            ph - margin - 20.0,
            sol_cell_mm,
            true,
            font_bold,
            font_reg,
        );
        pages.push(PdfPage::new(Mm(pw), Mm(ph), ops_sol));
    }

    let mut doc = PdfDocument::new(&puzzle.metadata.title);
    doc.with_pages(pages);
    let bytes = doc.save(&PdfSaveOptions::default(), &mut Vec::new());
    Ok(bytes)
}

fn draw_grid(
    ops: &mut Vec<Op>,
    cells: &[Vec<Cell>],
    size: usize,
    grid_x: f32,
    grid_top_y: f32,
    cell_mm: f32,
    show_solution: bool,
    font_bold: BuiltinFont,
    font_reg: BuiltinFont,
) {
    let letter_size = cell_mm * 0.55;
    let number_size = (cell_mm * 0.28).max(3.5);

    for row in 0..size {
        for col in 0..size {
            let cell = &cells[row][col];
            let x = grid_x + col as f32 * cell_mm;
            let y = grid_top_y - row as f32 * cell_mm;

            if cell.is_black {
                ops.push(Op::SetFillColor { col: rgb(0.0, 0.0, 0.0) });
                ops.push(Op::SetOutlineColor { col: rgb(0.0, 0.0, 0.0) });
                ops.push(Op::SetOutlineThickness { pt: Pt(0.3) });
                ops.push(Op::DrawPolygon { polygon: rect_poly(x, y, cell_mm, cell_mm, PaintMode::FillStroke) });
            } else {
                if cell.is_shaded {
                    ops.push(Op::SetFillColor { col: rgb(0.87, 0.87, 0.87) });
                    ops.push(Op::SetOutlineColor { col: rgb(0.0, 0.0, 0.0) });
                    ops.push(Op::SetOutlineThickness { pt: Pt(0.4) });
                    ops.push(Op::DrawPolygon { polygon: rect_poly(x, y, cell_mm, cell_mm, PaintMode::FillStroke) });
                } else {
                    ops.push(Op::SetFillColor { col: rgb(1.0, 1.0, 1.0) });
                    ops.push(Op::SetOutlineColor { col: rgb(0.0, 0.0, 0.0) });
                    ops.push(Op::SetOutlineThickness { pt: Pt(0.4) });
                    ops.push(Op::DrawPolygon { polygon: rect_poly(x, y, cell_mm, cell_mm, PaintMode::FillStroke) });
                }

                // Cell number
                if let Some(num) = cell.number {
                    push_text(ops, &num.to_string(), number_size, x + 0.6, y - 2.2, font_reg);
                }

                // Letter (solution mode)
                if show_solution {
                    let letter_str = if let Some(ref rebus) = cell.rebus {
                        rebus.clone()
                    } else if let Some(ch) = cell.letter {
                        ch.to_string()
                    } else {
                        String::new()
                    };
                    if !letter_str.is_empty() {
                        let fs = if letter_str.len() > 1 { letter_size * 0.55 } else { letter_size };
                        push_text(ops, &letter_str, fs, x + cell_mm * 0.2, y - cell_mm * 0.72, font_bold);
                    }
                }

                // Circle marker
                if cell.is_circled {
                    let cx = x + cell_mm / 2.0;
                    let cy = y - cell_mm / 2.0;
                    let r = cell_mm * 0.42;
                    let segs = 32_usize;
                    let circle_pts: Vec<LinePoint> = (0..segs)
                        .map(|i| {
                            let a = 2.0 * std::f32::consts::PI * i as f32 / segs as f32;
                            LinePoint {
                                p: Point::new(Mm(cx + r * a.cos()), Mm(cy + r * a.sin())),
                                bezier: false,
                            }
                        })
                        .collect();
                    ops.push(Op::SetFillColor { col: rgb(1.0, 1.0, 1.0) });
                    ops.push(Op::SetOutlineColor { col: rgb(0.25, 0.25, 0.25) });
                    ops.push(Op::SetOutlineThickness { pt: Pt(0.35) });
                    ops.push(Op::DrawPolygon { polygon: Polygon {
                        rings: vec![PolygonRing { points: circle_pts }],
                        mode: PaintMode::Stroke,
                        winding_order: WindingOrder::NonZero,
                    }});
                    // Re-draw number on top of circle stroke
                    if let Some(num) = cell.number {
                        push_text(ops, &num.to_string(), number_size, x + 0.6, y - 2.2, font_reg);
                    }
                }
            }
        }
    }
}
