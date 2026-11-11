# Keep `amountRefunded` on Refund Requests

When the `refunds` table became `refund_requests` (#1), we kept the
`amount_refunded` column. Its name describes the Refund, not the Refund Request.
That fits: the column holds the money returned when the request is Approved,
and stays null otherwise. A Refund is always the full amount paid, so today it
always equals `purchases.amount_paid`. We keep it as the record of what was
actually returned, so that this record stays put if a purchase's amount is ever
corrected later.
