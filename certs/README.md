# Company CA certificates (optional)

If your network inspects HTTPS with its own root certificate, put that certificate in this folder. Binary (`.cer`, `.der`) and text (`.crt`, `.pem`) files both work, and several files or bundles are fine.

The ThingsDeck server trusts them on its next start, in addition to the usual public CAs, so it can reach `api.smartthings.com`. The log confirms each one:

```
[thingsdeck] Trusting extra CA from company-ca.cer: CN=…
```

Certificates in this folder are never committed to git.
