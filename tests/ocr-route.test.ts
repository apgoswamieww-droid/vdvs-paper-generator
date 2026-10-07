import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

// The route keeps its tesseract worker on globalThis and only talks to the
// request through `req.json()`, so a mocked tesseract.js plus a fake request
// exercises every branch without WASM or a real server.
const { createWorkerMock, recognizeMock, terminateMock } = vi.hoisted(() => {
  const recognize = vi.fn();
  const terminate = vi.fn(async () => {});
  const createWorker = vi.fn(async () => ({
    setParameters: vi.fn(async () => {}),
    recognize,
    terminate,
    // The route watches the underlying worker_threads thread for death.
    worker: new EventEmitter(),
  }));
  return { createWorkerMock: createWorker, recognizeMock: recognize, terminateMock: terminate };
});

vi.mock("tesseract.js", () => ({
  OEM: { LSTM_ONLY: 1 },
  PSM: { SINGLE_BLOCK: "6" },
  createWorker: createWorkerMock,
}));

import { POST } from "@/app/api/ocr/route";

function makeReq(json: () => Promise<unknown>): NextRequest {
  return { json } as unknown as NextRequest;
}

function post(body: unknown): NextRequest {
  return makeReq(async () => body);
}

function statusOf(res: Response): Promise<{ status: number; body: Record<string, unknown> }> {
  return res.json().then((body) => ({ status: res.status, body }));
}

describe("POST /api/ocr", () => {
  it("rejects an invalid JSON body", async () => {
    const { status, body } = await statusOf(
      await POST(makeReq(() => Promise.reject(new SyntaxError("bad json"))))
    );
    expect(status).toBe(400);
    expect(body.error).toBe("Invalid JSON body");
  });

  it("rejects a missing image", async () => {
    const { status, body } = await statusOf(await POST(post({})));
    expect(status).toBe(400);
    expect(body.error).toBe("No image provided");
  });

  it("rejects an image over Vercel's body limit", async () => {
    const { status, body } = await statusOf(
      await POST(post({ image: "x".repeat(4_400_001) }))
    );
    expect(status).toBe(413);
    expect(body.error).toBe("Image too large. Try a smaller screenshot.");
  });

  it("rejects a body that decodes to nothing", async () => {
    const { status, body } = await statusOf(await POST(post({ image: "!!!" })));
    expect(status).toBe(400);
    expect(body.error).toBe("Could not decode image");
  });

  it("recognizes, cleans the text, and strips a data-URL header", async () => {
    recognizeMock.mockResolvedValueOnce({
      data: { text: "  Hello \n\n  world  \n" },
    });
    const { status, body } = await statusOf(
      await POST(post({ image: "data:image/png;base64,AAAA" }))
    );
    expect(status).toBe(200);
    expect(body.text).toBe("Hello\nworld");
    expect(recognizeMock).toHaveBeenCalledTimes(1);
    expect(recognizeMock.mock.calls[0][0]).toBeInstanceOf(Buffer);
  });

  it("reuses the warm worker across requests", async () => {
    expect(createWorkerMock).toHaveBeenCalledTimes(1);
    recognizeMock.mockResolvedValueOnce({ data: { text: "again" } });
    const { status, body } = await statusOf(await POST(post({ image: "AAAA" })));
    expect(status).toBe(200);
    expect(body.text).toBe("again");
    expect(createWorkerMock).toHaveBeenCalledTimes(1);
    expect(recognizeMock).toHaveBeenCalledTimes(2);
  });

  it("turns a recognition failure into a 500 without dropping the worker", async () => {
    recognizeMock.mockRejectedValueOnce("boom");
    const { status, body } = await statusOf(await POST(post({ image: "AAAA" })));
    expect(status).toBe(500);
    expect(body.error).toBe("OCR failed. Please try a clearer image.");
    expect(terminateMock).not.toHaveBeenCalled();
    expect(createWorkerMock).toHaveBeenCalledTimes(1);
  });
});
