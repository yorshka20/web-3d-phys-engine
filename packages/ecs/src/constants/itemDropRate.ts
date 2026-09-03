// Repeated rates are meaningful here (WEAPON and GLOBAL_PULL share one): this is a table of
// named drop rates, not a discriminant, so the reverse mapping a numeric enum generates is
// never used.
// oxlint-disable typescript/no-duplicate-enum-values
export enum ItemDropRate {
  EXPERIENCE = 1,
  LASER_BURST = 0.5,
  HEALTH = 0.05,
  WEAPON = 0.01,
  POWERUP = 0.1,
  MAGNET = 0.02,
  GLOBAL_PULL = 0.01,
}
