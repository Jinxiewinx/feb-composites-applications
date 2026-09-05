"""S6: what Fusion exposes about the open document's identity, for the mold
record's `fusion` block and for a later "Open in Fusion" link. Read-only.

The deep-link half of S6 is run from the shell, not from Fusion:

  open "fusion360://userEmail=<email>&lineageUrn=<dataFile.id>&hubUrl=<hub.fusionWebURL>&documentName=<name, URL-encoded>"

That is the format Fusion Team's own "Open in Fusion" button uses, and the
scheme Fusion.app registers in its Info.plist (CFBundleURLSchemes: fusion360).

Throwaway spike, not product code."""
import adsk.core, adsk.fusion


def run(_context: str):
    app = adsk.core.Application.get()
    doc = app.activeDocument
    df = doc.dataFile
    print("doc:", doc.name, "isSaved", doc.isSaved)
    for a in ("id", "name", "versionId", "versionNumber", "latestVersionNumber", "fileExtension",
              "description", "dateCreated", "dateModified", "fusionWebURL"):
        v = getattr(df, a)
        print(" ", a, "=", v)
    print("  createdBy =", df.createdBy.displayName, "lastUpdatedBy =", df.lastUpdatedBy.displayName)
    pp, pf = df.parentProject, df.parentFolder
    print("project:", pp.name, pp.id)
    print("folder:", pf.name, pf.id)
    hub = app.data.activeHub
    print("hub:", hub.name, hub.id, "type", hub.hubType, "url", hub.fusionWebURL)
    print("user:", app.currentUser.displayName, app.currentUser.email)
    # Not read on purpose: dataFile.publicLink and sharedLink create a share
    # when first accessed.
