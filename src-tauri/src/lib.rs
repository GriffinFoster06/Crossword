pub mod commands;
pub mod engine;
pub mod formats;
pub mod ai;

use tauri::Manager;
use std::sync::Arc;

pub use engine::worddb::WordDatabase;

pub struct AppState {
    pub word_db: Arc<WordDatabase>,
    pub clue_db_path: std::path::PathBuf,
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // Load word database — check user app data dir first, then bundled resource
            let resource_path = app
                .path()
                .resource_dir()
                .expect("failed to resolve resource dir");

            let app_data_path = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| resource_path.clone());

            // User can override bundled wordlist by placing wordlist.bin in app data dir
            let user_wordlist = app_data_path.join("wordlist.bin");
            let wordlist_path = if user_wordlist.exists() {
                log::info!("Using user wordlist from {:?}", user_wordlist);
                user_wordlist
            } else {
                resource_path.join("wordlist.bin")
            };
            let word_db = if wordlist_path.exists() {
                log::info!("Loading word database from {:?}", wordlist_path);
                match WordDatabase::load_binary(&wordlist_path) {
                    Ok(db) => {
                        log::info!("Loaded {} words", db.len());
                        db
                    }
                    Err(e) => {
                        log::warn!("Failed to load binary wordlist: {e}, using fallback");
                        WordDatabase::load_fallback()
                    }
                }
            } else {
                log::warn!("wordlist.bin not found at {:?}, using fallback", wordlist_path);
                WordDatabase::load_fallback()
            };

            let clue_db_path = resource_path.join("clues.db");

            app.manage(AppState {
                word_db: Arc::new(word_db),
                clue_db_path,
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::worddb::cmd_query_words,
            commands::worddb::cmd_get_word_count,
            commands::worddb::cmd_get_word_info,
            commands::grid::cmd_compute_numbers,
            commands::grid::cmd_toggle_black,
            commands::grid::cmd_validate_grid,
            commands::grid::cmd_get_stats,
            commands::autofill::cmd_start_autofill,
            commands::autofill::cmd_cancel_autofill,
            commands::fileio::cmd_save_puzzle,
            commands::fileio::cmd_load_puzzle,
            commands::fileio::cmd_export_puz,
            commands::fileio::cmd_import_puz,
            commands::fileio::cmd_export_pdf,
            commands::fileio::cmd_export_nyt,
            commands::ai::cmd_check_ollama,
            commands::ai::cmd_generate_clues,
            commands::ai::cmd_batch_generate_clues,
            commands::ai::cmd_develop_theme,
            commands::ai::cmd_suggest_words,
            commands::ai::cmd_construct_grid,
            commands::ai::cmd_parse_puzzle_request,
            commands::ai::cmd_evaluate_fill,
            commands::ai::cmd_get_clue_history,
            commands::ai::cmd_stream_ai_response,
            commands::ai::cmd_check_crossforge_models,
            commands::ai::cmd_install_models,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
