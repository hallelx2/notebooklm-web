import { Heading, Text } from "@notebooklm/ui";

/**
 * Standardised hero block for each settings pane. The outer width is
 * controlled by the surrounding settings layout (sidebar + content), so
 * this component only owns the heading composition + bottom padding —
 * no max-width / horizontal padding of its own.
 */
export function SettingsSection({
  tagline,
  title,
  description,
  children,
}: {
  tagline: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative z-10 pt-10 sm:pt-14 pb-20">
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-6 xl:gap-8 pb-6 sm:pb-8 mb-10 border-b border-border-subtle">
        <div>
          <div className="flex items-center gap-3 mb-3 sm:mb-4">
            <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
            <Text variant="caption" tone="muted">
              {tagline}
            </Text>
          </div>
          <Heading
            level="h1"
            weight="medium"
            className="text-3xl sm:text-4xl md:text-5xl tracking-tighter"
          >
            {title}
          </Heading>
        </div>
        <Text
          variant="lead"
          tone="secondary"
          className="max-w-md xl:text-left"
        >
          {description}
        </Text>
      </div>
      {children}
    </div>
  );
}
