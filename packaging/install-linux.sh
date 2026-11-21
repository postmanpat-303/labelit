#!/bin/sh
set -eu

source_dir=$(CDPATH= cd "$(dirname "$0")" && pwd)
install_dir="$HOME/.local/lib/label-it"

install -d "$install_dir"
install -m 755 "$source_dir/labelit" "$install_dir/labelit"
install -m 644 "$source_dir/BWIP-JS-LICENSE.txt" "$source_dir/INCONSOLATA-LICENSE.txt" "$install_dir/"
"$install_dir/labelit" --install-menu
printf '%s\n' 'Label-IT is ready. Find it under Office in your application menu.'
