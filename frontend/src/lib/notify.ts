import { toast } from "sonner";
import { errorMessage } from "./api";

export const notify = (message: string): void => {
  toast(message);
};

export const notifyError = (e: unknown, fallback: string): void => {
  toast.error(errorMessage(e, fallback));
};
