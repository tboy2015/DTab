import { Braces, Clock, Hash, Link2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ComponentType } from "react";
import { Base64Tool } from "./Base64Tool";
import { JsonTool } from "./JsonTool";
import { TimestampTool } from "./TimestampTool";
import { UrlTool } from "./UrlTool";
import { UuidTool } from "./UuidTool";

export interface ToolDefinition {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  component: ComponentType;
}

export const TOOLS: ToolDefinition[] = [
  {
    id: "json",
    label: "JSON 格式化",
    description: "格式化、压缩 JSON",
    icon: Braces,
    component: JsonTool
  },
  {
    id: "base64",
    label: "Base64",
    description: "Base64 编解码",
    icon: Hash,
    component: Base64Tool
  },
  {
    id: "url",
    label: "URL 编解码",
    description: "URL 编码与参数解析",
    icon: Link2,
    component: UrlTool
  },
  {
    id: "timestamp",
    label: "时间戳",
    description: "Unix 时间戳与日期互转",
    icon: Clock,
    component: TimestampTool
  },
  {
    id: "uuid",
    label: "UUID 生成",
    description: "批量生成 UUID v4",
    icon: Hash,
    component: UuidTool
  }
];
