export function weatherGradient(id: number | undefined, night: boolean): string {
  if (!id)
    return night
      ? "linear-gradient(160deg, #0b1220 0%, #050914 100%)"
      : "linear-gradient(160deg, #7aa4c4 0%, #a8bccb 100%)";
  if (id >= 200 && id < 600)
    return night
      ? "linear-gradient(160deg, #1a2233 0%, #070a12 100%)"
      : "linear-gradient(160deg, #4b5f77 0%, #7f95ac 100%)";
  if (id >= 600 && id < 700)
    return night
      ? "linear-gradient(160deg, #2a3345 0%, #10131c 100%)"
      : "linear-gradient(160deg, #94a8bd 0%, #cfd9e4 100%)";
  if (id >= 700 && id < 800)
    return night
      ? "linear-gradient(160deg, #23262e 0%, #0e0f14 100%)"
      : "linear-gradient(160deg, #8a95a3 0%, #b7c0cc 100%)";
  if (id === 800)
    return night
      ? "linear-gradient(160deg, #0b1e4a 0%, #050914 100%)"
      : "linear-gradient(160deg, #3f8fd6 0%, #7fbde8 60%, #bfe0f5 100%)";
  return night
    ? "linear-gradient(160deg, #1b2436 0%, #090c15 100%)"
    : "linear-gradient(160deg, #6d8aa5 0%, #a3b6c8 100%)";
}
