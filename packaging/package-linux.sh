#!/bin/bash
set -euo pipefail

root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
binary=${1:?Usage: bash packaging/package-linux.sh /path/to/linux/labelit}
output=${2:-"$root/src-tauri/target/linux-packages"}
version=$(node -p 'require(process.argv[1]).version' "$root/src-tauri/tauri.conf.json")
architecture=$(uname -m)
case "$architecture" in
    x86_64) deb_arch=amd64 ;;
    aarch64) deb_arch=arm64 ;;
    *) printf 'Unsupported packaging architecture: %s\n' "$architecture" >&2; exit 1 ;;
esac

binary=$(realpath "$binary")
test -x "$binary"
mkdir -p "$output"
output=$(realpath "$output")
work=$(mktemp -d)
trap 'rm -rf -- "$work"' EXIT
launcher="$root/packaging/app.labelit.editor.desktop"
icon="$root/src-tauri/icons/icon.png"
licenses=("$root/src/vendor/BWIP-JS-LICENSE.txt" "$root/src/vendor/INCONSOLATA-LICENSE.txt")
portable="Label-IT-$version-linux-$architecture"

install -Dm755 "$binary" "$work/$portable/labelit"
install -m755 "$root/packaging/install-linux.sh" "$work/$portable/install.sh"
install -m644 "${licenses[@]}" "$work/$portable/"
tar -czf "$output/$portable.tar.gz" -C "$work" "$portable"

if command -v dpkg-deb >/dev/null; then
    pkg="$work/deb"
    install -Dm755 "$binary" "$pkg/usr/bin/labelit"
    install -Dm644 "$launcher" "$pkg/usr/share/applications/app.labelit.editor.desktop"
    install -Dm644 "$icon" "$pkg/usr/share/icons/hicolor/32x32/apps/app.labelit.editor.png"
    install -d "$pkg/usr/share/doc/label-it" "$pkg/DEBIAN"
    install -m644 "${licenses[@]}" "$pkg/usr/share/doc/label-it/"
    glibc=$(objdump -T "$binary" | sed -nE 's/.*\(GLIBC_([0-9.]+)\).*/\1/p' | sort -V | tail -1)
    test -n "$glibc"
    cat > "$pkg/DEBIAN/control" <<EOF
Package: label-it
Version: $version
Section: office
Priority: optional
Architecture: $deb_arch
Maintainer: Label-IT
Depends: libc6 (>= $glibc), libgtk-3-0t64 | libgtk-3-0, libwebkit2gtk-4.1-0
Description: Design labels, barcodes, and shipping tags
 Label editor with exact-size PDF export.
EOF
    dpkg-deb --root-owner-group --build "$pkg" "$output/label-it_${version}_${deb_arch}.deb"
fi

if command -v rpmbuild >/dev/null; then
    install -d "$work/rpm/SOURCES"
    install -m755 "$binary" "$work/rpm/SOURCES/labelit"
    install -m644 "$launcher" "$icon" "${licenses[@]}" "$work/rpm/SOURCES/"
    rpmbuild -bb --nodeps --define "_topdir $work/rpm" --define "_rpmdir $output" \
        --define "labelit_version $version" "$root/packaging/label-it.spec"
fi
