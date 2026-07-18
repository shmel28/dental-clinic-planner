import sys

def find_unbalanced(filename):
    with open(filename, 'r', encoding='utf-8') as f:
        content = f.read()
    
    stack = []
    line_number = 1
    
    for i, char in enumerate(content):
        if char == '\n':
            line_number += 1
        elif char in '({[':
            stack.append((char, line_number))
        elif char in ')}]':
            if not stack:
                print(f"Extra closing {char} at line {line_number}")
                return
            last_char, last_line = stack[-1]
            if (last_char == '(' and char == ')') or \
               (last_char == '{' and char == '}') or \
               (last_char == '[' and char == ']'):
                stack.pop()
            else:
                pass
                
    if stack:
        print("Unclosed brackets:")
        for char, line in stack[-5:]:
            print(f"  {char} at line {line}")
    else:
        print("Balanced!")

find_unbalanced('src/App.tsx')
