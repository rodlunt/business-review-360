import React, { useState, useEffect } from "react";
import { TextField, Box, Chip } from "@mui/material";
import { getFormattingSuggestion, formatTextSuggestion } from "../utils/textValidation";

const FormattingTextField = ({
  label,
  value,
  onChange,
  fieldType = "description", // 'title', 'description', or 'comment'
  showSuggestions = true,
  maxSuggestions = 3,
  placeholder,
  required = false,
  multiline = false,
  minRows,
  fullWidth = true,
  ...otherProps
}) => {
  const [suggestions, setSuggestions] = useState([]);

  // Update suggestions when value changes
  useEffect(() => {
    if (showSuggestions && value && value.trim().length > 0) {
      const validation = getFormattingSuggestion(value, fieldType);
      setSuggestions(validation.suggestions.slice(0, maxSuggestions));
    } else {
      setSuggestions([]);
    }
  }, [value, fieldType, showSuggestions, maxSuggestions]);

  // Apply suggested formatting
  const applyFormatting = () => {
    const formatted = formatTextSuggestion(value, fieldType);
    onChange({ target: { value: formatted } });
  };

  // Enhanced onChange handler
  const handleChange = (e) => {
    onChange(e);
  };

  return (
    <Box>
      <TextField
        label={label}
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        required={required}
        fullWidth={fullWidth}
        multiline={multiline}
        minRows={minRows}
        sx={{
          "& .MuiInputBase-root": {
            minHeight: "48px", // Ensure touch-friendly height
          },
          "& .MuiInputBase-input": {
            minHeight: "1.4375em", // Material-UI standard with touch-friendly sizing
          },
          ...otherProps.sx,
        }}
        inputProps={{
          required: required,
          ...otherProps.inputProps,
        }}
        {...otherProps}
      />

      {showSuggestions && suggestions.length > 0 && (
        <Box sx={{ mt: 1, display: "flex", flexWrap: "wrap", gap: 0.5 }}>
          {suggestions.map((suggestion, index) => (
            <Chip
              key={index}
              label={suggestion}
              size="small"
              variant="outlined"
              sx={{
                fontSize: "0.75rem",
                fontWeight: 700,
                color: "#d32f2f",
                borderColor: "#d32f2f",
              }}
            />
          ))}
          {value && value.trim().length > 0 && (
            <Chip
              label="Fix formatting"
              size="small"
              color="primary"
              clickable
              onClick={applyFormatting}
              sx={{ fontSize: "0.75rem", fontWeight: 600 }}
            />
          )}
        </Box>
      )}
    </Box>
  );
};

export default FormattingTextField;
