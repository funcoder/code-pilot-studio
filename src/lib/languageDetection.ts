export const extensionToLanguage = (filePath?: string): string => {
  if (!filePath) {
    return "plaintext";
  }

  const lower = filePath.toLowerCase();
  if (lower.endsWith(".cs")) {
    return "csharp";
  }
  if (lower.endsWith(".razor")) {
    return "razor";
  }
  if (lower.endsWith(".json")) {
    return "json";
  }
  if (lower.endsWith(".xaml")) {
    return "xml";
  }
  if (lower.endsWith(".bicep")) {
    return "bicep";
  }
  if (lower.endsWith(".http")) {
    return "http";
  }
  return "plaintext";
};
