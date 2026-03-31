/// PDF export for CrossForge puzzles.
///
/// Generates a print-ready PDF with the crossword grid and clues.
/// Uses the `printpdf` crate for vector-based PDF generation.

use printpdf::*;
use crate::formats::json::PuzzleFile;

pub fn export_pdf(puzzle: &PuzzleFile, include_solution: bool) -> anyhow::Result<Vec<u8>> {
    let size = puzzle.grid.size;

    // Page setup: Letter size (8.5" x 11")
    let page_width = Mm(215.9);
    let page_height = Mm(279.4);
    let margin = Mm(20.0);

    let (doc, page_idx, layer_idx) =
        PdfDocument::new(&puzzle.metadata.title, page_width, page_height, "Grid");

    let layer = doc.get_page(page_idx).get_layer(layer_idx);

    // Calculate grid dimensions
    let available_width = page_width.0 - margin.0 * 2.0;
    let cell_size_mm = (available_width / size as f64).min(12.0); // max 12mm per cell
    let grid_width = cell_size_mm * size as f64;
    let grid_start_x = margin.0 + (available_width - grid_width) / 2.0;
    let grid_start_y = page_height.0 - margin.0 - 20.0; // Leave room for title

    // Draw title
    let font = doc.add_builtin_font(BuiltinFont::HelveticaBold).unwrap();
    let font_regular = doc.add_builtin_font(BuiltinFont::Helvetica).unwrap();

    if !puzzle.metadata.title.is_empty() {
        layer.use_text(
            &puzzle.metadata.title,
            14.0,
            Mm(grid_start_x),
            Mm(grid_start_y + 10.0),
            &font,
        );
    }

    if !puzzle.metadata.author.is_empty() {
        layer.use_text(
            &format!("By {}", puzzle.metadata.author),
            10.0,
            Mm(grid_start_x),
            Mm(grid_start_y + 3.0),
            &font_regular,
        );
    }

    // Draw grid
    for row in 0..size {
        for col in 0..size {
            let cell = &puzzle.grid.cells[row][col];
            let x = grid_start_x + col as f64 * cell_size_mm;
            let y = grid_start_y - row as f64 * cell_size_mm;

            // Cell rectangle
            let points = vec![
                (Point::new(Mm(x), Mm(y)), false),
                (Point::new(Mm(x + cell_size_mm), Mm(y)), false),
                (Point::new(Mm(x + cell_size_mm), Mm(y - cell_size_mm)), false),
                (Point::new(Mm(x), Mm(y - cell_size_mm)), false),
            ];

            if cell.is_black {
                // Filled black square
                let line = Line {
                    points,
                    is_closed: true,
                };
                layer.set_fill_color(Color::Rgb(Rgb::new(0.0, 0.0, 0.0, None)));
                layer.set_outline_color(Color::Rgb(Rgb::new(0.0, 0.0, 0.0, None)));
                layer.set_outline_thickness(0.5);
                layer.add_line(line);
            } else {
                // White square with border
                let line = Line {
                    points,
                    is_closed: true,
                };
                layer.set_fill_color(Color::Rgb(Rgb::new(1.0, 1.0, 1.0, None)));
                layer.set_outline_color(Color::Rgb(Rgb::new(0.0, 0.0, 0.0, None)));
                layer.set_outline_thickness(0.5);
                layer.add_line(line);

                // Cell number (top-left, small)
                if let Some(num) = cell.number {
                    layer.use_text(
                        &num.to_string(),
                        5.0,
                        Mm(x + 0.5),
                        Mm(y - 2.5),
                        &font_regular,
                    );
                }

                // Letter (centered) — only if include_solution
                if include_solution {
                    if let Some(letter) = cell.letter {
                        layer.use_text(
                            &letter.to_string(),
                            cell_size_mm as f32 * 0.65,
                            Mm(x + cell_size_mm * 0.3),
                            Mm(y - cell_size_mm * 0.75),
                            &font,
                        );
                    }
                }

                // Circle marker
                if cell.is_circled {
                    // Draw a circle in the cell (approximated with lines)
                    let cx = x + cell_size_mm / 2.0;
                    let cy = y - cell_size_mm / 2.0;
                    let r = cell_size_mm * 0.4;
                    let segments = 24;
                    let circle_points: Vec<(Point, bool)> = (0..segments)
                        .map(|i| {
                            let angle = 2.0 * std::f64::consts::PI * i as f64 / segments as f64;
                            (
                                Point::new(
                                    Mm(cx + r * angle.cos()),
                                    Mm(cy + r * angle.sin()),
                                ),
                                false,
                            )
                        })
                        .collect();

                    let circle = Line {
                        points: circle_points,
                        is_closed: true,
                    };
                    layer.set_fill_color(Color::Rgb(Rgb::new(1.0, 1.0, 1.0, None)));
                    layer.set_outline_color(Color::Rgb(Rgb::new(0.5, 0.5, 0.5, None)));
                    layer.set_outline_thickness(0.3);
                    layer.add_line(circle);
                }
            }
        }
    }

    // Draw clues below the grid
    let clue_y_start = grid_start_y - (size as f64 * cell_size_mm) - 15.0;
    let col_width = available_width / 2.0;
    let line_height = 4.0;
    let mut y_pos = clue_y_start;

    // Across clues (left column)
    layer.use_text("ACROSS", 9.0, Mm(grid_start_x), Mm(y_pos), &font);
    y_pos -= line_height * 1.5;

    for clue in &puzzle.clues.across {
        if y_pos < margin.0 {
            break; // Out of page space
        }
        let text = format!("{}. {}", clue.number, clue.text);
        // Truncate long clues for PDF
        let display = if text.len() > 60 { format!("{}...", &text[..57]) } else { text };
        layer.use_text(&display, 7.0, Mm(grid_start_x), Mm(y_pos), &font_regular);
        y_pos -= line_height;
    }

    // Down clues (right column)
    y_pos = clue_y_start;
    let right_col_x = grid_start_x + col_width;
    layer.use_text("DOWN", 9.0, Mm(right_col_x), Mm(y_pos), &font);
    y_pos -= line_height * 1.5;

    for clue in &puzzle.clues.down {
        if y_pos < margin.0 {
            break;
        }
        let text = format!("{}. {}", clue.number, clue.text);
        let display = if text.len() > 60 { format!("{}...", &text[..57]) } else { text };
        layer.use_text(&display, 7.0, Mm(right_col_x), Mm(y_pos), &font_regular);
        y_pos -= line_height;
    }

    let bytes = doc.save_to_bytes()?;
    Ok(bytes)
}
