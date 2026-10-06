import { mockIPC } from "@tauri-apps/api/mocks";
import { createRoot } from "react-dom/client";
import App from "../src/App";
import "@fontsource/inter/400.css";
import "@fontsource/inter/600.css";
import "../src/styles.css";
const settings = {
  provider: "none",
  cloud_consent: false,
  chat_model: "gpt-4o",
  analysis_model: "gpt-4o",
  player_id: null,
  player_name: null,
  modes: ["1v1", "2v2", "3v3"],
  focus: [],
  replay_folder: "synthetic",
  auto_import: true,
  onboarding_status: "skipped",
};
const identity = { player_id: "fixture:p", player_name: "Fixture Player", auto: true };
const candidates = [{ player_id: "fixture:p", name: "Fixture Player", matches: 5 }];
(window as any).fixtureCalls = [];
mockIPC((command, args: any) => {
  (window as any).fixtureCalls.push(command);
  if (command === "get_settings") return { ...settings };
  if (command === "save_settings") {
    Object.assign(settings, args.settings);
    return { ...settings };
  }
  if (command === "get_library") return { replays: [], identity_candidates: candidates };
  if (command === "resolve_identity") return identity;
  if (command === "get_import_status")
    return [
      {
        path: "synthetic/broken.replay",
        file_name: "broken.replay",
        status: "failed",
        error: "Invalid replay header",
      },
    ];
  if (command === "get_cloud_preview")
    return {
      provider: settings.provider,
      endpoint: "https://api.openai.com/v1/responses",
      characters: 12000,
      upper_bound_characters: 52000,
      categories: ["profile", "match metrics"],
      cost_label: "Exact charges unavailable; provider model rates apply.",
    };
  if (command === "create_conversation")
    return { id: "fixture:chat", title: "Fixture chat", mode: "All", preset: "Balanced" };
  if (command === "chat")
    return {
      response: "Offline-safe fixture reply. [Source](https://www.rocketleague.com)",
      conversation_id: "fixture:chat",
      status: "complete",
    };
  if (command === "get_progress") return null;
  if (command === "get_ai_status")
    return {
      current_provider: settings.provider,
      cloud_consent: settings.cloud_consent,
      providers: {
        openai: { configured: false },
        neotoken: { configured: false },
        chatgpt: { status: "unavailable" },
      },
    };
  if (command === "list_models") return { models: [{ id: "gpt-4o" }] };
  if (command.startsWith("get_")) return [];
  return null;
});
createRoot(document.getElementById("root")!).render(<App />);
