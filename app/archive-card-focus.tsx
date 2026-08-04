"use client";

import { useEffect } from "react";

const STYLE_ID = "archive-card-focus-styles";

const focusStyles = `
.archive-card-focus-overlay{
  position:fixed;
  z-index:4900;
  inset:0;
  display:grid;
  place-items:center;
  padding:72px 22px 28px;
  background:rgba(19,19,23,.48);
  -webkit-backdrop-filter:blur(12px);
  backdrop-filter:blur(12px);
  opacity:0;
  transition:opacity .2s ease;
  touch