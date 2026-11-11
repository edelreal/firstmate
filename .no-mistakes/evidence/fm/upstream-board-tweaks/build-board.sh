#!/usr/bin/env bash
# Real fm-bearings-board.sh build in a disposable home; lavish-axi is the same
# stub the render suite uses (Lavish server lifecycle is out of this change).
set -u
WT=$1; PAYLOAD=$2; OUT=$3
. "$WT/tests/lib.sh"
TMP_ROOT=$(fm_test_tmproot fm-bb-live)
home="$TMP_ROOT/home"
fm_test_track_procevent_home "$home" "$home/procevent-claims"
mkdir -p "$home/state" "$home/data" "$home/lavish-state"
fakebin=$(fm_fakebin "$home")
sed -n '/cat > "\$fakebin\/lavish-axi" <<'"'"'SH'"'"'/,/^SH$/p' "$WT/tests/fm-bearings-board-render.test.sh" | sed '1d;$d' > "$fakebin/lavish-axi"
chmod +x "$fakebin/lavish-axi"
PATH="$fakebin:$PATH" FM_HOME="$home" FM_STATE_OVERRIDE="$home/state" FM_DATA_OVERRIDE="$home/data" \
  FM_PROCEVENT_CLAIM_ROOT="$home/procevent-claims" LAVISH_AXI_STATE_DIR="$home/lavish-state" \
  FM_TEST_STUB_MAX_BLOCK_SECONDS=20 \
  "$WT/bin/fm-bearings-board.sh" build "$PAYLOAD"
rc=$?
echo "build-exit: $rc"
[ "$rc" -eq 0 ] && cp "$home/.lavish/bearings-board.html" "$OUT"
exit $rc
