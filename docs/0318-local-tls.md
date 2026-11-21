---
brief: Generate local DEV/QA HTTPS certificates and install their public CA on Windows, Linux and macOS.
tags: [cookbook, tls, certificates, dev, qa]
---

# Local HTTPS certificates and CA trust

Run these commands from the repository root. Install `mkcert` using its
[official platform instructions](https://github.com/FiloSottile/mkcert#installation).
This recipe uses the default `infra/local/certs` and `TLS_*` filenames; adapt
paths if your infrastructure env uses another directory or filename.

## Generate certificates on the issuing workstation

Use this section for a fresh setup, or an intentional certificate renewal.
Existing `localhost.pem`, `localhost-key.pem` and `rootCA.pem` will be replaced;
keep the previous set together if it must remain usable. If you already received
a matching server certificate/key/CA set, skip generation and install that set's
public CA using the next section. Creating an unrelated CA will not trust it.

`mkcert -install` creates a local CA when missing and installs it in the local
trust stores it supports. It may request OS approval or administrator access.
The CA signing key stays in `mkcert -CAROOT`, outside this repository. Copy only
`rootCA.pem` into the checkout; never copy or share `rootCA-key.pem`.

### Windows PowerShell

```powershell
New-Item -ItemType Directory -Force -Path .\infra\local\certs | Out-Null
mkcert -install
if ($LASTEXITCODE -ne 0) { throw 'mkcert CA installation failed' }
mkcert -cert-file .\infra\local\certs\localhost.pem -key-file .\infra\local\certs\localhost-key.pem localhost 127.0.0.1 ::1 modulon.local '*.modulon.local'
if ($LASTEXITCODE -ne 0) { throw 'Certificate generation failed' }
$localCaDirectory = mkcert -CAROOT
if ($LASTEXITCODE -ne 0) { throw 'Cannot locate the mkcert CA' }
Copy-Item -LiteralPath (Join-Path $localCaDirectory 'rootCA.pem') -Destination .\infra\local\certs\rootCA.pem
pnpm validate:certs --host localhost --host modulon.local --host web.modulon.local --host auth.modulon.local --host authconsole.modulon.local --host s3.modulon.local --host s3console.modulon.local --ip 127.0.0.1 --ip ::1
```

### Linux and macOS

```sh
mkdir -p infra/local/certs
mkcert -install &&
mkcert -cert-file infra/local/certs/localhost.pem -key-file infra/local/certs/localhost-key.pem localhost 127.0.0.1 ::1 modulon.local '*.modulon.local' &&
cp "$(mkcert -CAROOT)/rootCA.pem" infra/local/certs/rootCA.pem &&
chmod 600 infra/local/certs/localhost-key.pem &&
pnpm validate:certs --host localhost --host modulon.local --host web.modulon.local --host auth.modulon.local --host authconsole.modulon.local --host s3.modulon.local --host s3console.modulon.local --ip 127.0.0.1 --ip ::1
```

The quoted wildcard covers one level below `modulon.local`, including all default
DEV/QA Web, auth, auth console, S3 and S3 console names. It does not cover deeper
subdomains or custom domains; add those names when issuing a certificate.

## Install an existing public CA

These commands trust the CA in `infra/local/certs/rootCA.pem`. Verify that it is
the intended development CA before importing it. Install the public CA on each
workstation that opens the application; a server certificate alone is not a CA.
No private key is required for trust installation.

### Windows: current user

Run in Windows PowerShell with the PKI module available. This affects the current
user's root certificate store and may show a security confirmation:

```powershell
Import-Certificate -FilePath .\infra\local\certs\rootCA.pem -CertStoreLocation Cert:\CurrentUser\Root
```

For all users, run PowerShell **as administrator** and choose the machine store:

```powershell
Import-Certificate -FilePath .\infra\local\certs\rootCA.pem -CertStoreLocation Cert:\LocalMachine\Root
```

The store scopes and import command follow
[Microsoft's Import-Certificate reference](https://learn.microsoft.com/en-us/powershell/module/pki/import-certificate).

### Linux: Ubuntu and Debian

```sh
sudo install -m 0644 infra/local/certs/rootCA.pem /usr/local/share/ca-certificates/modulon-local-ca.crt &&
sudo update-ca-certificates
```

The PEM CA must use a `.crt` filename in that directory, as described in the
[Ubuntu CA trust guide](https://ubuntu.com/server/docs/how-to/security/install-a-root-ca-certificate-in-the-trust-store/).

### Linux: Fedora and RHEL

```sh
sudo install -m 0644 infra/local/certs/rootCA.pem /etc/pki/ca-trust/source/anchors/modulon-local-ca.crt &&
sudo update-ca-trust extract
```

This uses the system anchor directory documented in the
[Red Hat system design guide](https://docs.redhat.com/en/documentation/red_hat_enterprise_linux/8/html/system_design_guide/using-shared-system-certificates_system-design-guide).
Other Linux distributions can use different trust tools and paths.

### macOS: system keychain

```sh
sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain infra/local/certs/rootCA.pem
```

This installs a trusted root in the system keychain. The same keychain and
`security add-trusted-cert` mechanism are used by
[mkcert's macOS implementation](https://github.com/FiloSottile/mkcert/blob/master/truststore_darwin.go).

## Apply and verify

Restart the browser after changing trust. Browser-specific stores, including
Firefox/NSS setups, may require an additional import of the same public CA.
For mkcert-managed browser trust, install the platform NSS prerequisites from
the official mkcert instructions before running `mkcert -install`.
Windows and WSL have separate trust stores: install the CA in each environment
that runs an HTTPS client.

After replacing the server certificate/key, reload them in the running environment
(choose DEV or QA, not both). For DEV restart only the proxy:

```sh
docker compose --project-name modulonpocdev --env-file infra/local/.env.dev -f infra/local/compose.yaml -f infra/local/compose.dev.yaml restart proxy
```

For QA use its wrappers to stop and start the prepared services, including the
proxy. They derive the required private database URLs internally:

```sh
pnpm qa:stop && pnpm qa:start
```

Use your actual `STACK_NAME` in the DEV Compose command if customized. For a fresh stack, use the normal
`pnpm dev:infra:up` or QA startup instead. Restart Web after replacing its CA:
the launcher sets `NODE_EXTRA_CA_CERTS` before Node starts.

`pnpm validate:certs` checks files, expiry, key match, CA signature and selected
SANs; it does not check OS/browser trust. Verify the actual HTTPS connection
without bypassing trust:

```sh
curl --fail --head https://modulon.local
```

On Windows use `curl.exe` to select curl rather than the legacy PowerShell alias.
DEV and QA both use `https://modulon.local` by default and run alternately;
adapt configured domains and ports if customized.
The application/proxy must be running and the hostname must resolve locally;
see [Docker setup](0302-local-docker.md#prepare-configuration).

[Back to cookbook](0300-cookbook.md)
