import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { App as AntApp, ConfigProvider, Layout, Menu } from "antd";
import zhCN from "antd/locale/zh_CN";
import {
  AppstoreOutlined,
  DatabaseOutlined,
  EditOutlined,
  PieChartOutlined,
  UnorderedListOutlined,
  WalletOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import "dayjs/locale/zh-cn";
import AddExpensePage from "./AddExpensePage";
import ExpensesPage from "./ExpensesPage";
import CategoriesPage from "./CategoriesPage";
import StatisticsPage from "./StatisticsPage";
import BackupPage from "./BackupPage";
import { Category } from "./types";
import "./App.css";

dayjs.locale("zh-cn");

const { Sider, Content } = Layout;

type PageKey = "add" | "list" | "categories" | "stats" | "backup";

function Main() {
  const { message } = AntApp.useApp();
  const [categories, setCategories] = useState<Category[]>([]);
  const [page, setPage] = useState<PageKey>("add");

  const loadCategories = useCallback(async () => {
    try {
      setCategories(await invoke<Category[]>("list_categories"));
    } catch (e) {
      message.error(`加载分类失败：${e}`);
    }
  }, [message]);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  return (
    <Layout className="app-layout">
      <Sider width={180} theme="light" className="app-sider">
        <div className="app-logo">
          <WalletOutlined />
          用户记账
        </div>
        <Menu
          mode="inline"
          selectedKeys={[page]}
          onClick={(e) => setPage(e.key as PageKey)}
          items={[
            { key: "add", icon: <EditOutlined />, label: "记一笔" },
            { key: "list", icon: <UnorderedListOutlined />, label: "账单列表" },
            { key: "categories", icon: <AppstoreOutlined />, label: "分类管理" },
            { key: "stats", icon: <PieChartOutlined />, label: "月度统计" },
            { key: "backup", icon: <DatabaseOutlined />, label: "数据备份" },
          ]}
        />
      </Sider>
      <Layout>
        <Content className="app-content">
          <div className="page">
            {page === "add" && <AddExpensePage categories={categories} />}
            {page === "list" && <ExpensesPage categories={categories} />}
            {page === "categories" && (
              <CategoriesPage categories={categories} onChanged={loadCategories} />
            )}
            {page === "stats" && <StatisticsPage />}
            {page === "backup" && <BackupPage onImported={loadCategories} />}
          </div>
        </Content>
      </Layout>
    </Layout>
  );
}

export default function App() {
  return (
    <ConfigProvider locale={zhCN}>
      <AntApp>
        <Main />
      </AntApp>
    </ConfigProvider>
  );
}
