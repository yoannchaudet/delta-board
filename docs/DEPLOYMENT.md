# Deployment

> This is just an example deployment setup. Adapt it to your own infrastructure and requirements.

Delta Board is deployed at [delta-board.mavensoul.studio](https://delta-board.mavensoul.studio) on Azure Container Apps.

## Infrastructure

- **Azure Container Apps** in the `westus2` region
- **Resource group**: `Delta-Board`
- **Container Apps environment**: `delta-board`
- **Container image**: `ghcr.io/yoannchaudet/delta-board` (from GHCR, built by the release workflow)
- **Custom domain**: `delta-board.mavensoul.studio` with managed TLS

## Setup Steps

### 1. Create the Container Apps environment

```bash
az containerapp env create \
    --name delta-board \
    --resource-group Delta-Board \
    --location westus2
```

### 2. Create the container app

```bash
az containerapp create \
    --name delta-board \
    --resource-group Delta-Board \
    --environment delta-board \
    --image ghcr.io/yoannchaudet/delta-board:1.0.0 \
    --target-port 8080 \
    --ingress external \
    --max-replicas 1
```

### 3. Add the custom hostname (first attempt)

This initial call registers the hostname and returns the DNS records you need to create.

```bash
az containerapp hostname add \
    --name delta-board \
    --resource-group Delta-Board \
    --hostname delta-board.mavensoul.studio
```

### 4. Create DNS records

Add the following DNS records for `delta-board.mavensoul.studio`:

- **TXT** record for domain validation (value provided by the `hostname add` command)
- **CNAME** record pointing to the Container Apps environment FQDN

### 5. Add the custom hostname again

After the DNS records are in place, run the `hostname add` command again so Azure can verify them:

```bash
az containerapp hostname add \
    --name delta-board \
    --resource-group Delta-Board \
    --hostname delta-board.mavensoul.studio
```

### 6. Bind the hostname with managed certificate

```bash
az containerapp hostname bind \
    --name delta-board \
    --resource-group Delta-Board \
    --hostname delta-board.mavensoul.studio \
    --environment delta-board \
    --validation-method CNAME
```

## Updating

To deploy a new version, update the container image:

```bash
az containerapp update \
    --name delta-board \
    --resource-group Delta-Board \
    --image ghcr.io/yoannchaudet/delta-board:<version>
```
