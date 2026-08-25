/** GitHub CLI (`gh`) hosting DTOs — isomorphic (main + renderer). */

export interface GhAuthStatus {
  installed: boolean;
  authenticated: boolean;
  username?: string;
  error?: string;
}

export const EMPTY_GH_AUTH: GhAuthStatus = {
  installed: false,
  authenticated: false,
};

export interface GhPrCreateInput {
  projectRoot: string;
  title: string;
  base: string;
  head: string;
  draft?: boolean;
  body?: string;
}

export interface GhPrCreateResult {
  success: boolean;
  url?: string;
  number?: number;
  error?: string;
  output?: string;
}

export interface GhPrViewWebResult {
  success: boolean;
  error?: string;
  output?: string;
}
