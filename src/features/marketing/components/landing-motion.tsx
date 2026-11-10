"use client";

import { useEffect } from "react";
import { startLandingMotion } from "../landing-motion";

/** Client island of the public page: renders nothing, wires motion after hydration. */
export function LandingMotion() {
  useEffect(() => startLandingMotion(), []);
  return null;
}
