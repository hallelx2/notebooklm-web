/**
 * Design system primitives — token-driven, pack-aware.
 *
 * Every component here consumes only --ds-* tokens via the Tailwind
 * utility classes registered in apps/web/src/app/globals.css and
 * apps/desktop/src/main.css. None of them hardcode hex colors,
 * radii, or font sizes — flipping the active pack (saigon ↔ render)
 * or tone (light ↔ dark) restyles them automatically.
 */
export { Button, buttonVariants, type ButtonProps } from "./Button";
export { Card, cardVariants, type CardProps } from "./Card";
export { Heading, headingVariants, type HeadingProps } from "./Heading";
export { Text, textVariants, type TextProps } from "./Text";
export { Pill, pillVariants, type PillProps } from "./Pill";
export { Input, inputVariants, type InputProps } from "./Input";
export {
  Textarea,
  textareaVariants,
  type TextareaProps,
} from "./Textarea";
export {
  IconButton,
  iconButtonVariants,
  type IconButtonProps,
} from "./IconButton";
export { Stack, Inline, type StackProps } from "./Stack";
export { Skeleton } from "./Skeleton";
export { Spinner } from "./Spinner";
export { Modal, type ModalProps } from "./Modal";
