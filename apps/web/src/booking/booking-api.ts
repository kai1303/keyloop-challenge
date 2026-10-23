export class BookingRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function bookingRequest<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const response = await fetch("/api/" + path, options);
  const body = await response.json();
  if (!response.ok) {
    const message = Array.isArray(body.message)
      ? body.message.join(". ")
      : body.message;
    throw new BookingRequestError(
      message || "Unable to complete the request. Please try again.",
      response.status,
    );
  }
  return body as T;
}
