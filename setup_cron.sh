#!/bin/bash
(crontab -l 2>/dev/null | grep -v garmin_sync; echo "0 10 * * * cd /root/sup-challenge && /root/omni-quant/venv/bin/python garmin_sync.py >> /root/sup-challenge/sync.log 2>&1") | crontab -
echo "cron updated:"
crontab -l | grep garmin
