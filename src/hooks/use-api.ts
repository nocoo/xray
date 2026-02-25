"use client";

import { useState, useEffect, useCallback, useRef } from "react";

// =============================================================================
// Network error constant — single source of truth
// =============================================================================

const NETWORK_ERROR = "Network error — could not reach API";

// =============================================================================
// useFetch — auto-load data from an API endpoint on mount
// =============================================================================

export interface UseFetchResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useFetch<T>(
  endpoint: string,
  fallbackError = "Failed to load data",
): UseFetchResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch_ = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(endpoint);
      const json = await res.json().catch(() => null);

      if (!res.ok || !json?.success) {
        setError(json?.error ?? fallbackError);
      } else {
        setData(json.data ?? null);
      }
    } catch {
      setError(NETWORK_ERROR);
    } finally {
      setLoading(false);
    }
  }, [endpoint, fallbackError]);

  const didMount = useRef(false);
  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true;
      fetch_();
    }
  }, [fetch_]);

  return { data, loading, error, refetch: fetch_ };
}

// =============================================================================
// useSearch — fetch data triggered by user action (e.g. form submit)
// =============================================================================

export interface UseSearchResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  searched: boolean;
  execute: (url: string) => Promise<void>;
  reset: () => void;
}

export function useSearch<T>(
  fallbackError = "Search failed",
): UseSearchResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  const execute = useCallback(
    async (url: string) => {
      setLoading(true);
      setError(null);
      setSearched(true);

      try {
        const res = await fetch(url);
        const json = await res.json().catch(() => null);

        if (!res.ok || !json?.success) {
          setError(json?.error ?? fallbackError);
          setData(null);
        } else {
          setData(json.data ?? null);
        }
      } catch {
        setError(NETWORK_ERROR);
        setData(null);
      } finally {
        setLoading(false);
      }
    },
    [fallbackError],
  );

  const reset = useCallback(() => {
    setData(null);
    setError(null);
    setSearched(false);
  }, []);

  return { data, loading, error, searched, execute, reset };
}

// =============================================================================
// useMutation — execute a write operation (POST/PUT/DELETE)
// =============================================================================

export interface UseMutationResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  execute: (url: string, options?: RequestInit) => Promise<T | null>;
  reset: () => void;
}

export function useMutation<T = unknown>(
  fallbackError = "Operation failed",
): UseMutationResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const execute = useCallback(
    async (url: string, options?: RequestInit): Promise<T | null> => {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch(url, options);
        const json = await res.json().catch(() => null);

        if (!res.ok) {
          const errMsg = json?.error ?? fallbackError;
          setError(errMsg);
          return null;
        }

        const result = (json?.data ?? json) as T;
        setData(result);
        return result;
      } catch {
        setError(NETWORK_ERROR);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [fallbackError],
  );

  const reset = useCallback(() => {
    setData(null);
    setError(null);
  }, []);

  return { data, loading, error, execute, reset };
}
