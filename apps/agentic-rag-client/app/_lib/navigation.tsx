'use client';

import NextLink from 'next/link';
import { useParams as useNextParams, usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect } from 'react';
import type { AnchorHTMLAttributes, ReactNode } from 'react';

type NavigateOptions = {
  replace?: boolean;
};

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
  children: ReactNode;
  to: string;
};

type NavigateProps = {
  replace?: boolean;
  to: string;
};

/**
 * @description Provide the source app's imperative navigation shape through Next.js App Router.
 * @returns A function that pushes, replaces, or moves back in browser history.
 */
const useNavigate = () => {
  const router = useRouter();

  return useCallback(
    (destination: string | number, options?: NavigateOptions) => {
      if (typeof destination === 'number') {
        if (destination < 0) router.back();
        else router.forward();
        return;
      }

      if (options?.replace) router.replace(destination);
      else router.push(destination);
    },
    [router],
  );
};

/**
 * @description Expose current App Router pathname in the source app's location shape.
 * @returns Current browser pathname.
 */
const useLocation = () => {
  const pathname = usePathname();

  return { pathname };
};

/**
 * @description Return dynamic App Router params as string values for migrated views.
 * @returns Current route params.
 */
const useParams = () => useNextParams<Record<string, string>>();

/**
 * @description Render a Next.js link while retaining the source app's `to` prop.
 */
const Link = (props: LinkProps) => {
  const { children, to, ...anchorProps } = props;

  return (
    <NextLink href={to} {...anchorProps}>
      {children}
    </NextLink>
  );
};

/**
 * @description Perform declarative client-side redirects for migrated authorization guards.
 */
const Navigate = (props: NavigateProps) => {
  const { replace = false, to } = props;
  const navigate = useNavigate();

  useEffect(() => {
    navigate(to, { replace });
  }, [navigate, replace, to]);

  return null;
};

export { Link, Navigate, useLocation, useNavigate, useParams };
