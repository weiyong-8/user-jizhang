import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { save, open } from "@tauri-apps/plugin-dialog";
import { Alert, App, Button, Card, Typography } from "antd";
import { DownloadOutlined, UploadOutlined } from "@ant-design/icons";
import dayjs from "dayjs";

const { Title } = Typography;

export default function BackupPage({ onImported }: { onImported: () => Promise<void> }) {
  const { message, modal } = App.useApp();
  const [exporting, setExporting] = useState(false);

  async function doExport() {
    const path = await save({
      defaultPath: `用户记账备份-${dayjs().format("YYYY-MM-DD")}.jzbackup`,
      filters: [{ name: "用户记账备份", extensions: ["jzbackup"] }],
    });
    if (!path) return; // 用户取消
    setExporting(true);
    try {
      await invoke("export_backup", { path });
      message.success(`备份成功，文件已保存到：${path}`);
    } catch (e) {
      message.error(`备份失败：${e}`);
    } finally {
      setExporting(false);
    }
  }

  async function doImport() {
    const selected = (await open({
      multiple: false,
      filters: [{ name: "用户记账备份", extensions: ["jzbackup"] }],
    })) as string | null;
    if (!selected) return;
    modal.confirm({
      title: "导入备份将覆盖当前全部数据",
      content: `当前所有账单和分类将被备份文件（${selected}）完全替换，此操作不可撤销。确定继续吗？`,
      okText: "确定导入",
      cancelText: "取消",
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await invoke("import_backup", { path: selected });
          message.success("导入成功，数据已恢复");
          await onImported();
        } catch (e) {
          message.error(`导入失败：${e}`);
          throw e; // 保持确认框打开，方便用户换文件重试
        }
      },
    });
  }

  return (
    <>
      <Title level={3} style={{ marginBottom: 20 }}>
        数据备份
      </Title>

      <Card title="导出备份" size="small" className="backup-card">
        <p className="backup-desc">
          把全部账单和分类打包成一个备份文件（.jzbackup），建议定期备份。
          文件可以拷贝到 U 盘、网盘保存，换电脑后用「导入备份」即可完整恢复。
        </p>
        <Button type="primary" icon={<DownloadOutlined />} loading={exporting} onClick={doExport}>
          导出备份文件
        </Button>
      </Card>

      <Card title="导入备份（覆盖式恢复）" size="small" className="backup-card">
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          message="导入会用备份文件完整替换当前所有账单和分类，操作前请确认备份文件是你要恢复的版本。"
        />
        <Button danger icon={<UploadOutlined />} onClick={doImport}>
          选择备份文件并导入
        </Button>
      </Card>
    </>
  );
}
