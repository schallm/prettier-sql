using System;
using System.Runtime.InteropServices;
using System.Threading;
using Microsoft.VisualStudio.Shell;
using Task = System.Threading.Tasks.Task;

namespace PickyCode.PrettierPgsql;

/// <summary>
/// VS package entry point. Loads asynchronously to avoid blocking IDE startup.
/// </summary>
[PackageRegistration(UseManagedResourcesOnly = true, AllowsBackgroundLoading = true)]
[Guid(PackageGuidString)]
[ProvideMenuResource("Menus.ctmenu", 1)]
// Auto-load when a SQL file is opened so the command is available immediately
[ProvideAutoLoad(SqlContentTypeGuid, PackageAutoLoadFlags.BackgroundLoad)]
public sealed class PrettierPgsqlPackage : AsyncPackage {
    public const string PackageGuidString = "A3DF9C1B-A4BF-4315-B0EB-5DBAE5EDBC05";

    // VS content type GUID for SQL files
    private const string SqlContentTypeGuid = "{B371ABDB-D76C-4C17-8D03-6C79F8CB9042}";

    protected override async Task InitializeAsync(
        CancellationToken cancellationToken,
        IProgress<ServiceProgressData> progress) {
        await JoinableTaskFactory.SwitchToMainThreadAsync(cancellationToken);
        await FormatCommand.InitializeAsync(this);
    }
}
