FROM rust:1-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends \
    dbus-x11 desktop-file-utils libayatana-appindicator3-dev libgtk-3-dev \
    librsvg2-dev libwebkit2gtk-4.1-dev nodejs xauth xvfb \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build
COPY build-frontend.mjs index.html style.css ./
COPY src ./src
COPY references ./references
COPY packaging ./packaging
COPY src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/build.rs src-tauri/tauri*.json ./src-tauri/
COPY src-tauri/icons ./src-tauri/icons
COPY src-tauri/src ./src-tauri/src
RUN node build-frontend.mjs \
    && cargo build --release --locked --manifest-path src-tauri/Cargo.toml --features custom-protocol \
    && bash packaging/package-linux.sh src-tauri/target/release/labelit /packages
