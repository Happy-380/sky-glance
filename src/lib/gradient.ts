export function weatherGradient(id: number | undefined, night: boolean): string {
  /* Daytime skies are kept saturated on purpose: these panels are white-on-sky,
     so a stop that drifts towards white takes the contrast of every label with
     it. The night values are the ones the design targets. */
  if (!id)
    return night
      ? "linear-gradient(160deg, #0b1220 0%, #050914 100%)"
      : "linear-gradient(180deg, #3f5d7a 0%, #71909f 100%)";
  if (id >= 200 && id < 600)
    return night
      ? "linear-gradient(160deg, #1a2233 0%, #070a12 100%)"
      : "linear-gradient(180deg, #2c4159 0%, #5a7391 100%)";
  if (id >= 600 && id < 700)
    return night
      ? "linear-gradient(160deg, #2a3345 0%, #10131c 100%)"
      : "linear-gradient(180deg, #5b7089 0%, #93a7ba 100%)";
  if (id >= 700 && id < 800)
    return night
      ? "linear-gradient(160deg, #23262e 0%, #0e0f14 100%)"
      : "linear-gradient(180deg, #5c6673 0%, #8d99a6 100%)";
  if (id === 800)
    return night
      ? "linear-gradient(160deg, #0b1e4a 0%, #050914 100%)"
      : "linear-gradient(180deg, #1d5c9e 0%, #3b82c4 55%, #5f9fd6 100%)";
  return night
    ? "linear-gradient(160deg, #1b2436 0%, #090c15 100%)"
    : "linear-gradient(180deg, #40617f 0%, #7290a8 100%)";
}
