import { ComponentPropsWithRef, forwardRef } from "react";
import { Slottable } from "@radix-ui/react-slot";

import { Hint } from "@/components/ui/hint";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type TooltipIconButtonProps = ComponentPropsWithRef<typeof Button> & {
  tooltip: string;
  side?: "top" | "bottom" | "left" | "right";
};

export const TooltipIconButton = forwardRef<
  HTMLButtonElement,
  TooltipIconButtonProps
>(({ children, tooltip, side = "bottom", className, ...rest }, ref) => {
  return (
    <Hint label={tooltip} side={side}>
      <Button
        variant="ghost"
        size="icon"
        {...rest}
        className={cn("size-6 p-1", className)}
        ref={ref}
      >
        <Slottable>{children}</Slottable>
        <span className="sr-only">{tooltip}</span>
      </Button>
    </Hint>
  );
});

TooltipIconButton.displayName = "TooltipIconButton";
