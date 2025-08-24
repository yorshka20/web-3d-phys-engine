import { mount } from "svelte";
import GameUI from "./ui/GameUI.svelte";

export function main() {
  // Mount the Svelte UI. Game bootstrap logic was moved to `createSimulator.ts`
  // to avoid a circular import between `main.ts` and `GameUI.svelte` that caused
  // a temporal dead zone error ("Cannot access 'GameUI' before initialization").
  mount(GameUI, {
    target: document.body,
  });
}
