// src/theme.js
import { createTheme } from '@mui/material/styles';

const theme = createTheme({
  palette: {
    primary: {
      main: '#1976d2', // bright-ish blue
    },
    secondary: {
      main: '#e91e63', // bright pink
    },
    background: {
      default: '#f9f9f9', // light grey background for the app
    },
  },
  shape: {
    borderRadius: 8, // slightly more rounded corners than default (4)
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none', // remove ALL CAPS on buttons
        },
      },
    },
  },
});

export default theme;
