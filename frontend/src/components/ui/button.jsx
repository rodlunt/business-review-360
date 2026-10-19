import * as React from "react";
import MuiButton from "@mui/material/Button";

const Button = React.forwardRef(function Button(props, ref) {
  return <MuiButton ref={ref} {...props} />;
});

export { Button };
