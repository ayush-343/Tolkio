import React from "react";
import { LANGUAGE_TO_FLAG } from "../constants/index.js";

export function getLanguageFlag(language) {
  if (!language) return null;
  const langLower = language.toLowerCase();
  const countryCode = LANGUAGE_TO_FLAG[langLower];
  if (!countryCode) return null;
  return (
    <img
      src={`https://flagcdn.com/${countryCode}.svg`}
      alt={`${language} flag`}
      className="inline-block h-4 mr-1"
    />
  );
}
