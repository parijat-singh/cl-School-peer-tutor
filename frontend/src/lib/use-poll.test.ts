// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { usePoll } from "./use-poll";

describe("usePoll", () => {
  it("fetches immediately and returns data", async () => {
    const fetcher = vi.fn().mockResolvedValue([1, 2, 3]);
    const { result } = renderHook(() => usePoll(fetcher, [], { intervalMs: 60_000 }));

    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).toEqual([1, 2, 3]);
    expect(result.current.error).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("sets error when fetcher rejects", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("network fail"));
    const { result } = renderHook(() => usePoll(fetcher, [], { intervalMs: 60_000 }));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe("network fail");
    expect(result.current.data).toBeNull();
  });

  it("wraps non-Error rejections", async () => {
    const fetcher = vi.fn().mockRejectedValue("string error");
    const { result } = renderHook(() => usePoll(fetcher, [], { intervalMs: 60_000 }));

    await waitFor(() => {
      expect(result.current.error).not.toBeNull();
    });

    expect(result.current.error?.message).toBe("string error");
  });

  it("does not fetch when enabled is false", async () => {
    const fetcher = vi.fn().mockResolvedValue("data");
    const { result } = renderHook(() => usePoll(fetcher, [], { enabled: false }));

    // Give it a tick to settle
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(fetcher).not.toHaveBeenCalled();
    expect(result.current.data).toBeNull();
  });

  it("refetches when deps change", async () => {
    const fetcher = vi.fn().mockResolvedValue("v1");
    const { result, rerender } = renderHook(
      ({ dep }) => usePoll(fetcher, [dep], { intervalMs: 60_000 }),
      { initialProps: { dep: "a" } },
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(fetcher).toHaveBeenCalledTimes(1);

    rerender({ dep: "b" });

    await waitFor(() => {
      expect(fetcher).toHaveBeenCalledTimes(2);
    });
  });

  it("polls at the specified interval", async () => {
    const fetcher = vi.fn().mockResolvedValue("ok");
    renderHook(() => usePoll(fetcher, [], { intervalMs: 50 }));

    await waitFor(() => {
      expect(fetcher.mock.calls.length).toBeGreaterThanOrEqual(2);
    }, { timeout: 500 });
  });

  it("refetch function triggers immediate fetch", async () => {
    const fetcher = vi.fn().mockResolvedValue("data");
    const { result } = renderHook(() => usePoll(fetcher, [], { intervalMs: 60_000 }));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(fetcher).toHaveBeenCalledTimes(1);

    await act(async () => {
      result.current.refetch();
    });

    await waitFor(() => {
      expect(fetcher).toHaveBeenCalledTimes(2);
    });
  });

  it("clears interval on unmount", async () => {
    const fetcher = vi.fn().mockResolvedValue("data");
    const { result, unmount } = renderHook(() => usePoll(fetcher, [], { intervalMs: 50 }));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    const callCount = fetcher.mock.calls.length;

    unmount();

    // Wait and verify no more calls happen
    await new Promise((r) => setTimeout(r, 150));
    expect(fetcher.mock.calls.length).toBe(callCount);
  });
});
