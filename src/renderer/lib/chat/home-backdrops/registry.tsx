import type { ComponentType } from "react";
import { AcademicBackdrop } from "./academic";
import { BlueprintBackdrop } from "./blueprint";
import { BookshelfBackdrop } from "./bookshelf";
import { CircuitBackdrop } from "./circuit";
import { ClipsBackdrop } from "./clips";
import { ConstellationBackdrop } from "./constellation";
import { ForestBackdrop } from "./forest";
import { InkBackdrop } from "./ink";
import { OrigamiBackdrop } from "./origami";
import { PaperplaneBackdrop } from "./paperplane";
import { PendulumBackdrop } from "./pendulum";
import { RainBackdrop } from "./rain";
import { StampBackdrop } from "./stamp";
import { StarfieldBackdrop } from "./starfield";
import type { ChatHomeBackdropStyle } from "./types";
import { CHAT_HOME_BACKDROP_STYLES } from "./types";

export const CHAT_HOME_BACKDROP_COMPONENTS: Record<
  ChatHomeBackdropStyle,
  ComponentType
> = {
  academic: AcademicBackdrop,
  origami: OrigamiBackdrop,
  rain: RainBackdrop,
  forest: ForestBackdrop,
  blueprint: BlueprintBackdrop,
  starfield: StarfieldBackdrop,
  circuit: CircuitBackdrop,
  bookshelf: BookshelfBackdrop,
  ink: InkBackdrop,
  clips: ClipsBackdrop,
  paperplane: PaperplaneBackdrop,
  stamp: StampBackdrop,
  pendulum: PendulumBackdrop,
  constellation: ConstellationBackdrop,
};

export const CHAT_HOME_BACKDROP_LABEL_KEYS: Record<ChatHomeBackdropStyle, string> = {
  academic: "settings.appearance.chatHomeBackdropAcademic",
  origami: "settings.appearance.chatHomeBackdropOrigami",
  rain: "settings.appearance.chatHomeBackdropRain",
  forest: "settings.appearance.chatHomeBackdropForest",
  blueprint: "settings.appearance.chatHomeBackdropBlueprint",
  starfield: "settings.appearance.chatHomeBackdropStarfield",
  circuit: "settings.appearance.chatHomeBackdropCircuit",
  bookshelf: "settings.appearance.chatHomeBackdropBookshelf",
  ink: "settings.appearance.chatHomeBackdropInk",
  clips: "settings.appearance.chatHomeBackdropClips",
  paperplane: "settings.appearance.chatHomeBackdropPaperplane",
  stamp: "settings.appearance.chatHomeBackdropStamp",
  pendulum: "settings.appearance.chatHomeBackdropPendulum",
  constellation: "settings.appearance.chatHomeBackdropConstellation",
};

/** Style picker options (excludes `auto` / legacy `none`). */
export const CHAT_HOME_BACKDROP_STYLE_OPTIONS = CHAT_HOME_BACKDROP_STYLES;
