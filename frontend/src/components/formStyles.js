// Global form style based on SuperuserSetup

const formStyles = {
  root: {
    // height removed to prevent full viewport fill
    display: "block",
    overflowY: "visible",
  },
  cardBox: {
    display: "flex",
    width: "100%",
    overflowY: "visible",
    justifyContent: "center",
    alignItems: "flex-start",
    height: "70vh",
  },
  card: {
    maxWidth: 400,
    p: 2,
  },
  title: {
    variant: "h5",
    align: "center",
    fontWeight: 700,
    mb: 3,
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: 1,
    width: 291,
  },
  input: {
    size: "small",
  },
  button: {
    size: "small",
    width: "100%",
  },
  errorBox: {
    ariaLive: "assertive",
  },
  infoBox: {
    display: "flex",
    // alignItems: "center",
    alignItems: "flex-start",
    color: "#1565c0",
    border: "1px solid #90caf9",
    borderRadius: 2,
    px: 2,
    marginTop: "30vh",
    mb: 0,
    mt: 0,
  },
};

export default formStyles;
