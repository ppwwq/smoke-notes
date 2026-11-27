# Jotday for iPhone and iPad

From the repository root, install the workspace dependencies and build the iOS web resources.

```sh
pnpm install --frozen-lockfile
pnpm --filter @smoke-notes/web build:ios
```

The second command can also run on Windows. It generates the bundled `Sources/Jotday/Web/` folder. Run it again after changing the web code or the workspace's web environment configuration.

On a Mac with Xcode, generate the app icon from the existing Jotday artwork and build for the iOS Simulator.

```sh
swift apps/ios/make-app-icon.swift
xcodebuild -project apps/ios/Jotday.xcodeproj -scheme Jotday \
  -configuration Debug -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath apps/ios/DerivedData CODE_SIGNING_ALLOWED=NO build
```

For an iPhone or iPad running iOS or iPadOS 16 or later, open `Jotday.xcodeproj` in Xcode, select the Jotday target, choose your development team in Signing & Capabilities, and select and run on the device. Change the bundle identifier there if `app.jotday.calendar` is unavailable to your team.
