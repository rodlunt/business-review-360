import React, { createContext, useState, useCallback, useContext } from "react";
import Snackbar from "@mui/material/Snackbar";
import Alert from "@mui/material/Alert";

const SnackbarContext = createContext({ showSnackbar: () => {} });

export const useSnackbar = () => useContext(SnackbarContext);

export default function GlobalSnackbarProvider({ children }) {
  const [snack, setSnack] = useState({ open: false, message: "", severity: "success" });

  const showSnackbar = useCallback((message, severity = "success") => {
    setSnack({ open: true, message, severity });
  }, []);

  const handleClose = useCallback((_, reason) => {
    if (reason === "clickaway") return;
    setSnack((s) => ({ ...s, open: false }));
  }, []);

  return (
    <SnackbarContext.Provider value={{ showSnackbar }}>
      {children}
      <Snackbar
        open={snack.open}
        autoHideDuration={4000}
        onClose={handleClose}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert onClose={handleClose} severity={snack.severity} sx={{ width: "100%" }}>
          {snack.message}
        </Alert>
      </Snackbar>
    </SnackbarContext.Provider>
  );
}

export { SnackbarContext };
