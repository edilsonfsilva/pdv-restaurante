-- PDV Restaurante - Dados Iniciais (Seed)
-- Cardápio exemplo baseado em restaurante regional

-- Categorias
INSERT INTO categorias (nome, icone, ordem) VALUES
('Entradas', '🥗', 1),
('Carnes', '🥩', 2),
('Peixes', '🐟', 3),
('Aves', '🍗', 4),
('Acompanhamentos', '🍚', 5),
('Bebidas', '🥤', 6),
('Sobremesas', '🍮', 7),
('Porções', '🍟', 8);

-- Produtos - Entradas
INSERT INTO produtos (categoria_id, codigo, nome, preco, tempo_preparo) VALUES
(1, 'ENT001', 'Carne de Sol Desfiada', 32.00, 10),
(1, 'ENT002', 'Queijo Coalho na Brasa', 28.00, 8),
(1, 'ENT003', 'Escondidinho de Carne Seca', 36.00, 12),
(1, 'ENT004', 'Caldinho de Feijão', 12.00, 5),
(1, 'ENT005', 'Pastel de Carne (3 un)', 18.00, 8);

-- Produtos - Carnes
INSERT INTO produtos (categoria_id, codigo, nome, preco, tempo_preparo) VALUES
(2, 'CAR001', 'Picanha na Brasa (500g)', 89.00, 25),
(2, 'CAR002', 'Bode Guisado', 68.00, 20),
(2, 'CAR003', 'Carne de Sol Acebolada', 58.00, 18),
(2, 'CAR004', 'Costela no Bafo', 72.00, 30),
(2, 'CAR005', 'Buchada de Bode', 45.00, 15),
(2, 'CAR006', 'Sarapatel', 42.00, 15);

-- Produtos - Peixes
INSERT INTO produtos (categoria_id, codigo, nome, preco, tempo_preparo) VALUES
(3, 'PEI001', 'Peixe Frito (Tilápia)', 52.00, 20),
(3, 'PEI002', 'Camarão Alho e Óleo', 78.00, 18),
(3, 'PEI003', 'Moqueca de Peixe', 68.00, 25),
(3, 'PEI004', 'Casquinha de Siri', 32.00, 12);

-- Produtos - Aves
INSERT INTO produtos (categoria_id, codigo, nome, preco, tempo_preparo) VALUES
(4, 'AVE001', 'Galinha Caipira Guisada', 58.00, 20),
(4, 'AVE002', 'Frango à Cabidela', 52.00, 18),
(4, 'AVE003', 'Galeto na Brasa', 48.00, 25);

-- Produtos - Acompanhamentos
INSERT INTO produtos (categoria_id, codigo, nome, preco, tempo_preparo) VALUES
(5, 'ACO001', 'Arroz Branco', 12.00, 5),
(5, 'ACO002', 'Feijão Verde', 14.00, 5),
(5, 'ACO003', 'Macaxeira Cozida', 10.00, 5),
(5, 'ACO004', 'Farofa da Casa', 12.00, 3),
(5, 'ACO005', 'Pirão', 10.00, 5),
(5, 'ACO006', 'Vinagrete', 8.00, 3),
(5, 'ACO007', 'Baião de Dois', 18.00, 8);

-- Produtos - Bebidas
INSERT INTO produtos (categoria_id, codigo, nome, preco, tempo_preparo) VALUES
(6, 'BEB001', 'Refrigerante Lata', 6.00, 1),
(6, 'BEB002', 'Refrigerante 600ml', 8.00, 1),
(6, 'BEB003', 'Suco Natural 500ml', 12.00, 5),
(6, 'BEB004', 'Água Mineral', 4.00, 1),
(6, 'BEB005', 'Cerveja Long Neck', 9.00, 1),
(6, 'BEB006', 'Cerveja 600ml', 14.00, 1),
(6, 'BEB007', 'Caipirinha', 16.00, 5),
(6, 'BEB008', 'Cachaça (dose)', 8.00, 1);

-- Produtos - Sobremesas
INSERT INTO produtos (categoria_id, codigo, nome, preco, tempo_preparo) VALUES
(7, 'SOB001', 'Cartola', 22.00, 8),
(7, 'SOB002', 'Bolo de Rolo', 14.00, 3),
(7, 'SOB003', 'Cocada', 8.00, 2),
(7, 'SOB004', 'Pudim de Leite', 12.00, 3),
(7, 'SOB005', 'Sorvete (2 bolas)', 14.00, 3);

-- Produtos - Porções
INSERT INTO produtos (categoria_id, codigo, nome, preco, tempo_preparo) VALUES
(8, 'POR001', 'Batata Frita', 28.00, 12),
(8, 'POR002', 'Mandioca Frita', 24.00, 12),
(8, 'POR003', 'Calabresa Acebolada', 32.00, 10),
(8, 'POR004', 'Torresmo', 28.00, 8),
(8, 'POR005', 'Mix de Petiscos', 45.00, 15);

-- Mesas
INSERT INTO mesas (numero, capacidade, localizacao) VALUES
('01', 4, 'salao'),
('02', 4, 'salao'),
('03', 4, 'salao'),
('04', 6, 'salao'),
('05', 6, 'salao'),
('06', 2, 'varanda'),
('07', 2, 'varanda'),
('08', 4, 'varanda'),
('09', 8, 'vip'),
('10', 8, 'vip'),
('BAL', 1, 'balcao');
