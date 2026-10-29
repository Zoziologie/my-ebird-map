"""Extract the first worksheet as CSV, using cached formula values and preserving blanks."""
import csv
import sys
import xml.etree.ElementTree as ET
from zipfile import ZipFile

ns = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
with ZipFile(sys.argv[1]) as workbook:
    strings = [
        ''.join(item.itertext())
        for item in ET.fromstring(workbook.read('xl/sharedStrings.xml')).findall('s:si', ns)
    ]
    sheet = ET.fromstring(workbook.read('xl/worksheets/sheet1.xml'))

writer = csv.writer(sys.stdout)
for row in sheet.findall('s:sheetData/s:row', ns):
    values = {}
    for cell in row.findall('s:c', ns):
        column = 0
        for letter in cell.attrib['r'].rstrip('0123456789'):
            column = column * 26 + ord(letter) - ord('A') + 1
        value = cell.findtext('s:v', default='', namespaces=ns)
        if cell.get('t') == 's':
            value = strings[int(value)]
        elif cell.get('t') == 'inlineStr':
            value = ''.join(cell.find('s:is', ns).itertext())
        values[column] = value
    writer.writerow([values.get(column, '') for column in range(1, max(values) + 1)])
