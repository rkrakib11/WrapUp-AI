import type { AnchorHTMLAttributes, MouseEvent } from "react";
import { openExternalUrl } from "@/lib/app-shell";

type ExternalLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
};

function shouldLetBrowserHandle(event: MouseEvent<HTMLAnchorElement>) {
  return event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
}

export default function ExternalLink({ href, onClick, ...props }: ExternalLinkProps) {
  const handleClick = async (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (event.defaultPrevented || shouldLetBrowserHandle(event)) return;

    event.preventDefault();
    await openExternalUrl(href);
  };

  return <a {...props} href={href} onClick={handleClick} />;
}
