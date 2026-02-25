import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { Table } from '@src/components/common/Table';

interface TestItem {
  id: number;
  name: string;
  age: number;
}

const testData: TestItem[] = [
  { id: 1, name: 'Alice', age: 25 },
  { id: 2, name: 'Bob', age: 30 },
  { id: 3, name: 'Charlie', age: 35 },
];

const testColumns = [
  { header: 'Name', cell: (item: TestItem) => item.name },
  { header: 'Age', cell: (item: TestItem) => item.age },
];

describe('Table', () => {
  it('should render empty message when data is empty', () => {
    render(
      <Table
        data={[]}
        columns={testColumns}
        keyExtractor={(item: TestItem) => item.id}
      />
    );
    expect(screen.getByText('No data available')).toBeInTheDocument();
  });

  it('should render custom empty message', () => {
    render(
      <Table
        data={[]}
        columns={testColumns}
        keyExtractor={(item: TestItem) => item.id}
        emptyMessage="Nothing to show"
      />
    );
    expect(screen.getByText('Nothing to show')).toBeInTheDocument();
  });

  it('should render column headers', () => {
    render(
      <Table
        data={testData}
        columns={testColumns}
        keyExtractor={(item: TestItem) => item.id}
      />
    );
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Age')).toBeInTheDocument();
  });

  it('should render all data rows', () => {
    render(
      <Table
        data={testData}
        columns={testColumns}
        keyExtractor={(item: TestItem) => item.id}
      />
    );
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('Charlie')).toBeInTheDocument();
  });

  it('should render cell content from cell functions', () => {
    render(
      <Table
        data={testData}
        columns={testColumns}
        keyExtractor={(item: TestItem) => item.id}
      />
    );
    expect(screen.getByText('25')).toBeInTheDocument();
    expect(screen.getByText('30')).toBeInTheDocument();
  });

  it('should call onRowClick when a row is clicked', async () => {
    const user = userEvent.setup();
    const handleRowClick = vi.fn();

    render(
      <Table
        data={testData}
        columns={testColumns}
        keyExtractor={(item: TestItem) => item.id}
        onRowClick={handleRowClick}
      />
    );

    await user.click(screen.getByText('Alice'));
    expect(handleRowClick).toHaveBeenCalledWith(testData[0]);
  });

  it('should add cursor-pointer class when onRowClick is provided', () => {
    const { container } = render(
      <Table
        data={testData}
        columns={testColumns}
        keyExtractor={(item: TestItem) => item.id}
        onRowClick={vi.fn()}
      />
    );

    const rows = container.querySelectorAll('tbody tr');
    rows.forEach((row) => {
      expect(row.className).toContain('cursor-pointer');
    });
  });

  it('should not add cursor-pointer class when onRowClick is not provided', () => {
    const { container } = render(
      <Table
        data={testData}
        columns={testColumns}
        keyExtractor={(item: TestItem) => item.id}
      />
    );

    const rows = container.querySelectorAll('tbody tr');
    rows.forEach((row) => {
      expect(row.className).not.toContain('cursor-pointer');
    });
  });

  it('should merge custom className', () => {
    const { container } = render(
      <Table
        data={testData}
        columns={testColumns}
        keyExtractor={(item: TestItem) => item.id}
        className="mt-4"
      />
    );

    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).toContain('mt-4');
  });

  it('should apply column className to header and cell', () => {
    const columnsWithClass = [
      { header: 'Name', cell: (item: TestItem) => item.name, className: 'w-1/2' },
    ];

    const { container } = render(
      <Table
        data={[testData[0]]}
        columns={columnsWithClass}
        keyExtractor={(item: TestItem) => item.id}
      />
    );

    const th = container.querySelector('th');
    const td = container.querySelector('td');
    expect(th?.className).toContain('w-1/2');
    expect(td?.className).toContain('w-1/2');
  });
});
