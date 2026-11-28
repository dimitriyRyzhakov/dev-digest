/** File orders offered by the Files changed tab: reviewer-ordered groups or GitHub's flat list. */
export const DIFF_ORDERS = ["smart", "original"] as const;
export type DiffOrder = (typeof DIFF_ORDERS)[number];

/** i18n key (prReview.smartDiff) of each order's toggle button. */
export const DIFF_ORDER_LABEL_KEY: Record<DiffOrder, "smartOrder" | "originalOrder"> = {
  smart: "smartOrder",
  original: "originalOrder",
};
