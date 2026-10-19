// Text validation and formatting utilities
// Note: bad-words v4 uses CommonJS, we need to handle it differently in the browser
// For now, we'll use a simple implementation with a basic word list
// The backend uses bad-words library for server-side validation

// Basic profanity list - backend has comprehensive validation with bad-words library
const PROFANITY_LIST = [
  "damn",
  "hell",
  "crap",
  "ass",
  "shit",
  "fuck",
  "bitch",
  "bastard",
  "piss",
  "dick",
  "cock",
  "pussy",
  "cunt",
  "whore",
  "slut",
  "fag",
  "nigger",
  "retard",
  "asshole",
  "douche",
  "jackass",
  "dumbass",
  "prick",
  "twat",
  "bollocks",
  "wanker",
  "tosser",
];

// Check if text contains profanity
export const containsProfanity = (text) => {
  if (!text) return false;

  const lowerText = text.toLowerCase();

  // Check for exact word matches with word boundaries
  for (const word of PROFANITY_LIST) {
    const regex = new RegExp(`\\b${word}\\b`, "i");
    if (regex.test(lowerText)) {
      return true;
    }
  }

  return false;
};

// Get profanity validation result with helpful message
export const validateProfanity = (text) => {
  if (containsProfanity(text)) {
    return {
      isValid: false,
      error: "Please keep language professional and appropriate for the workplace.",
    };
  }

  return {
    isValid: true,
    error: null,
  };
};

export const validateTextFormatting = (text, options = {}) => {
  const { isTitle = false, isDescription = false, minLength = 0, maxLength = Infinity } = options;

  const suggestions = [];

  if (!text || text.trim().length === 0) {
    return { suggestions: [], isValid: true };
  }

  const trimmedText = text.trim();

  // Length validation
  if (trimmedText.length < minLength) {
    suggestions.push(`Should be at least ${minLength} characters`);
  }
  if (trimmedText.length > maxLength) {
    suggestions.push(`Should be no more than ${maxLength} characters`);
  }

  // Capitalization checks
  if (!trimmedText.match(/^[A-Z]/)) {
    suggestions.push("Should start with a capital letter");
  }

  // Title-specific checks
  if (isTitle) {
    if (trimmedText.match(/[.!?]$/)) {
      suggestions.push("Titles typically don't need ending punctuation");
    }
    // Check for proper title case (optional suggestion)
    const words = trimmedText.split(" ");
    const hasLowercaseStart = words.some((word, index) => {
      // Skip articles, prepositions, conjunctions after first word
      const skipWords = [
        "a",
        "an",
        "the",
        "and",
        "or",
        "but",
        "in",
        "on",
        "at",
        "to",
        "for",
        "of",
        "with",
        "by",
      ];
      if (index === 0) return false; // First word should always be capitalized
      if (skipWords.includes(word.toLowerCase()) && word.length <= 3) return false;
      return word.length > 0 && !word.match(/^[A-Z]/);
    });

    if (hasLowercaseStart) {
      suggestions.push("Consider capitalizing important words in the title");
    }
  }

  // Description-specific checks
  if (isDescription) {
    if (!trimmedText.match(/[.!?]$/)) {
      suggestions.push("Consider ending with proper punctuation");
    }

    // Check for multiple sentences
    const sentences = trimmedText.split(/[.!?]+/).filter((s) => s.trim().length > 0);
    if (sentences.length > 1) {
      // Check if sentences start with capital letters
      const sentenceText = trimmedText.replace(/[.!?]+\s*/g, ". ");
      if (!sentenceText.match(/\.\s+[A-Z]/g) && sentences.length > 1) {
        suggestions.push("New sentences should start with capital letters");
      }
    }
  }

  // Common formatting issues
  if (trimmedText.includes("  ")) {
    suggestions.push("Consider removing extra spaces");
  }

  if (trimmedText.match(/^[a-z]/)) {
    // Already covered above, but this is the main one
  }

  // Check for common grammar patterns
  if (trimmedText.match(/\bi\b/g)) {
    suggestions.push("Consider capitalizing 'I' when referring to yourself");
  }

  return {
    suggestions,
    isValid: suggestions.length === 0,
    characterCount: trimmedText.length,
  };
};

export const getFormattingSuggestion = (text, fieldType) => {
  const options = {
    title: { isTitle: true, minLength: 5, maxLength: 100 },
    description: { isDescription: true, minLength: 10, maxLength: 1000 },
    comment: { isDescription: true, minLength: 3, maxLength: 500 },
  };

  return validateTextFormatting(text, options[fieldType] || {});
};

export const formatTextSuggestion = (text, fieldType) => {
  if (!text) return text;

  let formatted = text;

  // Step 1: Clean up whitespace issues first
  // Remove extra spaces (multiple spaces to single space)
  formatted = formatted.replace(/\s+/g, " ");
  // Trim leading/trailing whitespace
  formatted = formatted.trim();
  // Fix spacing around punctuation
  formatted = formatted.replace(/\s+([.,!?;:])/g, "$1"); // Remove space before punctuation
  formatted = formatted.replace(/([.,!?;:])([^\s\d])/g, "$1 $2"); // Add space after punctuation if missing

  // Step 2: Detect if text is ALL CAPS or all lowercase and normalize it
  const isAllCaps = formatted === formatted.toUpperCase() && formatted !== formatted.toLowerCase();
  const isAllLowercase =
    formatted === formatted.toLowerCase() && formatted !== formatted.toUpperCase();

  if (isAllCaps || isAllLowercase) {
    // Convert to lowercase first, then we'll apply proper capitalization
    formatted = formatted.toLowerCase();
  }

  // Capitalize first letter of entire text
  if (formatted.length > 0) {
    formatted = formatted.charAt(0).toUpperCase() + formatted.slice(1);
  }

  // Fix standalone "i" to "I" (with word boundaries)
  formatted = formatted.replace(/\bi\b/g, "I");

  // Fix "i'" to "I'" (like "i'm" -> "I'm", "i've" -> "I've")
  formatted = formatted.replace(/\bi'/g, "I'");

  // Step 3: Field-specific formatting
  if (fieldType === "title") {
    // Remove ending punctuation for titles
    formatted = formatted.replace(/[.!?]+$/, "");

    // Optional: Apply title case for major words
    // Split into words and capitalize important words
    const words = formatted.split(" ");
    const smallWords = [
      "a",
      "an",
      "and",
      "as",
      "at",
      "but",
      "by",
      "for",
      "if",
      "in",
      "of",
      "on",
      "or",
      "the",
      "to",
      "via",
      "with",
    ];
    formatted = words
      .map((word, index) => {
        // Always capitalize first and last word
        if (index === 0 || index === words.length - 1) {
          return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
        }
        // Don't capitalize small words unless they start a sentence
        if (smallWords.includes(word.toLowerCase()) && word.length <= 4) {
          return word.toLowerCase();
        }
        // Capitalize all other words
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      })
      .join(" ");
  }

  if (fieldType === "description" || fieldType === "comment") {
    // Capitalize after sentence endings (. ! ?)
    formatted = formatted.replace(/([.!?]\s+)([a-z])/g, (match, punctuation, letter) => {
      return punctuation + letter.toUpperCase();
    });

    // Also capitalize after sentence endings with uppercase letters (for cases after normalization)
    formatted = formatted.replace(/([.!?]\s+)(\w)/g, (match, punctuation, letter) => {
      return punctuation + letter.toUpperCase();
    });

    // Capitalize after line breaks
    formatted = formatted.replace(/(\n\s*)([a-z])/g, (match, linebreak, letter) => {
      return linebreak + letter.toUpperCase();
    });

    // Capitalize after line breaks with any character
    formatted = formatted.replace(/(\n\s*)(\w)/g, (match, linebreak, letter) => {
      return linebreak + letter.toUpperCase();
    });

    // Ensure text ends with proper punctuation if it doesn't have any
    if (!formatted.match(/[.!?]$/)) {
      formatted = formatted + ".";
    }
  }

  return formatted;
};
