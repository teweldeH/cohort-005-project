# Build Notifications in-house

Cadence builds Notifications itself rather than buying them from a vendor
(#35). It owns all of it: who receives a Notification and when, storage,
unread/read state, the bell and live updates.

We briefly chose Knock (#31) for its hosted inbox, read state and real-time
feed, then reversed that. The integration and its setup were too risky for what
v1 needs. Recipients and withdrawal are decided by Cadence's own rules anyway
(#25): who can view a course's content, who is a Thread Participant, and
withdrawing a Notification when its Comment is deleted. Keeping a vendor's copy
of that state in step with ours added a second source of truth and a failure
mode. The parts Knock would have given us are small on this stack:

- **Storage:** a `notifications` table, written in the same transaction as the
  Comment that causes it, so the two always agree.
- **Read state:** one nullable `read_at` column covers the unread badge, read on
  click, Mark all read and mark unread.
- **Live updates:** the bell polls a resource route about every 30 seconds
  (#24), which keeps the promise of seeing a Notification within about a minute
  without a long-lived connection.

What we give up: a hosted feed UI, cross-channel delivery and batching come for
free with a vendor, and we'd now have to build them ourselves if we ever need
them. Changing our minds later means migrating stored Notifications and read
state into the vendor.
