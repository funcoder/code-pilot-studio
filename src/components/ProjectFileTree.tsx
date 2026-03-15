import type { ReactElement } from "react";

interface ProjectFileTreeProps {
  files: string[];
  activeFilePath?: string;
  onSelectFile: (filePath: string) => void;
}

interface TreeNode {
  name: string;
  path: string;
  type: "folder" | "file";
  children: TreeNode[];
}

const createNode = (
  name: string,
  path: string,
  type: "folder" | "file"
): TreeNode => ({
  name,
  path,
  type,
  children: []
});

const buildFileTree = (files: string[]): TreeNode[] => {
  const roots: TreeNode[] = [];

  for (const filePath of files) {
    const parts = filePath.split("/").filter(Boolean);
    let currentPath = "";
    let siblings = roots;

    parts.forEach((part, index) => {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const isFile = index === parts.length - 1;
      let node = siblings.find((item) => item.path === currentPath);

      if (!node) {
        node = createNode(part, currentPath, isFile ? "file" : "folder");
        siblings.push(node);
      }

      if (!isFile) {
        siblings = node.children;
      }
    });
  }

  const sortNodes = (nodes: TreeNode[]) => {
    nodes.sort((left, right) => {
      if (left.type !== right.type) {
        return left.type === "folder" ? -1 : 1;
      }
      return left.name.localeCompare(right.name);
    });

    for (const node of nodes) {
      sortNodes(node.children);
    }
  };

  sortNodes(roots);
  return roots;
};

const renderNode = (
  node: TreeNode,
  activeFilePath: string | undefined,
  onSelectFile: (filePath: string) => void,
  depth = 0
): ReactElement => {
  if (node.type === "file") {
    return (
      <button
        key={node.path}
        type="button"
        className={`project-file-tree__file ${
          activeFilePath === node.path ? "project-file-tree__file--active" : ""
        }`}
        onClick={() => onSelectFile(node.path)}
        style={{ paddingLeft: `${depth * 14 + 14}px` }}
      >
        <span className="project-file-tree__icon">FILE</span>
        <span className="project-file-tree__name">{node.name}</span>
      </button>
    );
  }

  return (
    <div className="project-file-tree__folder" key={node.path}>
      <div
        className="project-file-tree__folder-label"
        style={{ paddingLeft: `${depth * 14 + 14}px` }}
      >
        <span className="project-file-tree__icon">DIR</span>
        <span className="project-file-tree__name">{node.name}</span>
      </div>
      <div className="project-file-tree__children">
        {node.children.map((child) => renderNode(child, activeFilePath, onSelectFile, depth + 1))}
      </div>
    </div>
  );
};

export function ProjectFileTree({
  files,
  activeFilePath,
  onSelectFile
}: ProjectFileTreeProps) {
  const tree = buildFileTree(files);

  if (tree.length === 0) {
    return (
      <div className="project-file-tree__empty">
        <strong>No project files yet</strong>
        <p>Select a project with source files to start editing.</p>
      </div>
    );
  }

  return (
    <div className="project-file-tree">
      {tree.map((node) => renderNode(node, activeFilePath, onSelectFile))}
    </div>
  );
}
