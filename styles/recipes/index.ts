import { defineRecipe } from "@pandacss/dev";

const button = defineRecipe({
  base: {
    fontFamily: "body",
    borderWidth: "thin",
    borderStyle: "solid",
    borderColor: "borderSubtle",
    borderRadius: "full",
    padding: "2 5",
    fontSize: "sm",
    fontWeight: "600",
    transition: "background 0.2s ease, border-color 0.2s ease, color 0.2s ease",
    cursor: "pointer",
    _focusVisible: {
      outlineStyle: "solid",
      outlineColor: "focusRing",
      outlineWidth: "3px",
      outlineOffset: "2px",
    },
  },
  variants: {
    variant: {
      solid: {},
      ghost: {
        background: "transparent",
        borderColor: "transparent",
        _hover: {
          background: "surfaceRaised",
        },
      },
      outline: {
        background: "transparent",
        borderColor: "borderStrong",
        _hover: {
          background: "surfaceRaised",
          borderColor: "textPrimary",
        },
      },
    },
    tone: {
      primary: {
        background: "primary",
        color: "surface",
        borderColor: "primary",
        _hover: {
          background: "primaryHover",
          borderColor: "primaryHover",
        },
        _active: {
          background: "primaryActive",
          borderColor: "primaryActive",
        },
      },
      neutral: {
        background: "surfaceRaised",
        color: "textPrimary",
        borderColor: "borderSubtle",
        _hover: {
          background: "surface",
        },
      },
      danger: {
        background: "danger",
        color: "surface",
        borderColor: "danger",
        _hover: {
          opacity: 0.95,
        },
      },
    },
    size: {
      sm: { fontSize: "xs", padding: "1.5 4" },
      md: {},
      lg: { fontSize: "md", padding: "3 6" },
    },
  },
  defaultVariants: {
    variant: "solid",
    tone: "primary",
    size: "md",
  },
});

const input = defineRecipe({
  base: {
    borderWidth: "thin",
    borderStyle: "solid",
    borderColor: "borderSubtle",
    borderRadius: "md",
    padding: "3 4",
    fontSize: "sm",
    background: "surface",
    width: "full",
    fontFamily: "body",
    transition: "border-color 0.2s ease, box-shadow 0.2s ease",
    _focusVisible: {
      outlineStyle: "solid",
      outlineColor: "focusRing",
      outlineWidth: "3px",
      outlineOffset: "1px",
      borderColor: "focusRing",
    },
  },
  variants: {
    tone: {
      subtle: {
        background: "surfaceRaised",
      },
      neutral: {},
    },
  },
  defaultVariants: {
    tone: "neutral",
  },
});

const badge = defineRecipe({
  base: {
    borderRadius: "full",
    fontSize: "xs",
    fontWeight: "600",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "1 4",
    letterSpacing: "0.05em",
    textTransform: "uppercase",
  },
  variants: {
    tone: {
      neutral: {
        background: "surfaceRaised",
        color: "textSecondary",
        borderWidth: "thin",
        borderStyle: "solid",
        borderColor: "borderSubtle",
      },
      success: {
        background: "successBg",
        color: "success",
      },
      info: {
        background: "infoBg",
        color: "info",
      },
      danger: {
        background: "danger",
        color: "surface",
      },
    },
  },
  defaultVariants: {
    tone: "neutral",
  },
});

const card = defineRecipe({
  base: {
    background: "surface",
    borderWidth: "thin",
    borderStyle: "solid",
    borderColor: "borderSubtle",
    borderRadius: "xl",
    boxShadow: "card",
    display: "grid",
    gap: "4",
    padding: "6",
  },
  variants: {
    tone: {
      default: {},
      elevated: {
        boxShadow: "toolbar",
      },
    },
  },
  defaultVariants: {
    tone: "default",
  },
});

const toolbar = defineRecipe({
  base: {
    display: "flex",
    flexWrap: "wrap",
    gap: "3",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: "thin",
    borderStyle: "solid",
    borderColor: "borderSubtle",
    borderRadius: "lg",
    padding: "3 4",
    background: "surfaceRaised",
    boxShadow: "toolbar",
  },
  variants: {
    density: {
      comfortable: {
        gap: "4",
      },
      compact: {
        gap: "2",
        paddingY: "2",
      },
    },
  },
  defaultVariants: {
    density: "comfortable",
  },
});

const tableRow = defineRecipe({
  base: {
    borderWidth: "thin",
    borderStyle: "solid",
    borderColor: "borderSubtle",
    borderRadius: "lg",
    background: "surface",
    transition: "background 0.2s ease",
    _hover: {
      background: "surfaceRaised",
    },
    _focusVisible: {
      outlineStyle: "solid",
      outlineColor: "focusRing",
      outlineWidth: "3px",
      outlineOffset: "1px",
    },
  },
  variants: {
    density: {
      comfortable: {
        padding: "3 4",
      },
      compact: {
        padding: "2 3",
      },
    },
  },
  defaultVariants: {
    density: "comfortable",
  },
});

const chip = defineRecipe({
  base: {
    display: "inline-flex",
    alignItems: "center",
    gap: "2",
    padding: "1 4",
    borderRadius: "full",
    borderWidth: "thin",
    borderStyle: "solid",
    borderColor: "borderSubtle",
    background: "surfaceRaised",
    fontSize: "xs",
  },
});

const iconButton = defineRecipe({
  base: {
    borderRadius: "full",
    borderWidth: "thin",
    borderStyle: "solid",
    borderColor: "borderSubtle",
    background: "surface",
    width: "10",
    height: "10",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "background 0.2s ease, border-color 0.2s ease",
    _hover: {
      background: "surfaceRaised",
    },
    _focusVisible: {
      outlineStyle: "solid",
      outlineColor: "focusRing",
      outlineWidth: "3px",
      outlineOffset: "2px",
    },
  },
});

export const recipes = {
  button,
  input,
  badge,
  card,
  toolbar,
  tableRow,
  chip,
  iconButton,
};
