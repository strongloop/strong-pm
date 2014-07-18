#!/bin/bash
fails=0

function fail() {
  report=$1
  output=$2
  fails=$((fails+1))
  echo "not ok # $report"
  echo "# $report" >&2
  echo "$output" >&2
}

function ok() {
  cmd=$1
  echo "ok # $cmd"
}

function assert_exit() {
  expected="$1"
  shift
  cmd="$*"
  output=`$cmd 2>&1`
  result=$?
  report="exit $result should be $expected: '$cmd'"
  if test $result -ne $expected; then
    fail "$report" "$output"
  else
    ok "$report"
  fi
}

function assert_file() {
  local fname=$1
  if test $# -gt 1; then
    shift
    found=$(grep "\\$*" $fname)
    result=$?
    if test $result -eq 0; then
      ok "needle: '$*' in $fname"
    else
      fail "needle: '$*' NOT in $fname"
    fi
  else
    report="file exists: $fname"
    if test -f $fname; then
      ok "$report"
    else
      fail "$report"
    fi
  fi
}

function assert_report() {
  exit $fails
}
