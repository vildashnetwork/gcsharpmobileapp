# Android app version check

The mobile app's online Android version check and required update prompt have
been removed. The backend endpoint and release record described here remain
available for external dashboard/admin workflows, but the mobile app no longer
calls them. Android and iOS builds still require native version metadata in
`frontend/app.json`.

## Repository backend implementation

The backend implementation in this repository is separate from the deployed
`gcupload.onrender.com` service. It uses the `downloadnewversion` collection in
the configured GC Sharp MongoDB database. It stores one Android release
document, keyed by `_id: "android"`:

| Field | Type | Meaning |
| --- | --- | --- |
| `_id` | string | Fixed singleton key, `android`. |
| `platform` | string | Release platform; currently `android`. |
| `version_name` | string | User-facing Android version name, such as `2.5.8`. |
| `version_code` | integer | Android `versionCode` for the release. |
| `play_store_url` | string | HTTPS Google Play listing URL for package `com.gcsharp`. |
| `updated_at` | ISO-8601 UTC string | When the release record was last changed. |
| `updated_by` | string | Admin user ID for an update; `system` for the initial seed. |

On backend startup, the collection is initialized only if its singleton
document does not yet exist. The initial values are `version_name` `2.5.7` and
`version_code` `21`. Startup never overwrites a release configured by an admin.

## API

- `GET /api/app/downloadnewversion` is public and returns `platform`,
  `version_name`, `version_code`, `play_store_url`, and `updated_at`.
- `PUT /api/app/downloadnewversion` requires an authenticated user with the
  `admin` role. It validates the Play Store host, listing path, and package ID,
  then replaces the singleton release document.

Example request for a new Play Store release:

```http
PUT /api/app/downloadnewversion
Authorization: Bearer <ADMIN_TOKEN>
Content-Type: application/json

{
  "version_name": "2.0.1",
  "version_code": 21,
  "play_store_url": "https://play.google.com/store/apps/details?id=com.gcsharp"
}
```

Configure the record with the release's actual `version_code` and
`version_name` if an external dashboard uses this legacy API. Existing database
records are not changed by the startup seed.

The mobile app no longer calls the version endpoint. Users update native builds
through Google Play or their normal store update settings.
