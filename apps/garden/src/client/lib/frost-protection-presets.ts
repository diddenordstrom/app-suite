import type { MsgKey } from "../i18n";

/**
 * Canonical mapping from human-pickable frost-protection level → frostBufferC.
 * The dropdown stores frostBufferC directly on growingLocation.frostBufferC.
 * This table is purely UI sugar — pick a level, store the °C number.
 *
 * Buffer values sourced from Eliot Coleman "The Winter Harvest Handbook" +
 * empirical season-extension literature:
 *   open ground: 0  (no protection)
 *   row cover:   +1 (frost fleece / fiberduk)
 *   cold frame:  +2 (unheated frame with glass/polycarbonate lid)
 *   polytunnel:  +3 (unheated single-skin poly)
 *   greenhouse:  +5 (unheated glasshouse)
 */
export interface FrostProtectionPreset {
  key: string;
  frostBufferC: number;
  i18nKey: MsgKey;
}

export const FROST_PROTECTION_PRESETS: FrostProtectionPreset[] = [
  { key: "open_ground", frostBufferC: 0, i18nKey: "locationForm.frostProtection.openGround" },
  { key: "row_cover", frostBufferC: 1, i18nKey: "locationForm.frostProtection.rowCover" },
  { key: "cold_frame", frostBufferC: 2, i18nKey: "locationForm.frostProtection.coldFrame" },
  { key: "polytunnel", frostBufferC: 3, i18nKey: "locationForm.frostProtection.polytunnel" },
  { key: "greenhouse", frostBufferC: 5, i18nKey: "locationForm.frostProtection.greenhouse" },
];

/**
 * Find the preset best matching a stored frostBufferC value.
 * Falls back to open_ground (0) when no exact match — safe for pre-Phase-3
 * locations that defaulted to 0.
 */
export function presetForBuffer(frostBufferC: number): FrostProtectionPreset {
  return (
    FROST_PROTECTION_PRESETS.find((p) => p.frostBufferC === frostBufferC) ??
    FROST_PROTECTION_PRESETS[0]!
  );
}
